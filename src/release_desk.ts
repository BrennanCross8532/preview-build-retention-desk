import { createServer, type ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import { InfraiError } from "./infrai_gateway.js";
import { diagnosticRequestSchema } from "./preview_retention.js";
import { diagnoseBuild } from "./preview_retention.js";
import { reconcileRetention } from "./retention_cutover.js";

const sweepRequestSchema = z.object({ bucket: z.string().min(3) });

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/diagnostics") {
      const input = diagnosticRequestSchema.parse(await readJson(request));
      send(response, 200, diagnoseBuild(input));
      return;
    }
    if (request.method === "POST" && request.url === "/internal/retention-sweep") {
      const input = sweepRequestSchema.parse(await readJson(request));
      send(response, 200, await reconcileRetention(input.bucket));
      return;
    }
    send(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      send(response, 400, { error: "invalid request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, detail: error.detail });
      return;
    }
    send(response, 500, { error: "request processing failed" });
  }
});

const port = Number(process.env.PORT ?? "3000");
server.listen(port, () => console.log(`Release desk listening on http://localhost:${port}`));
