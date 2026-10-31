import { cutoverRequestSchema } from "../src/preview_retention.js";
import { configureRetention } from "../src/retention_cutover.js";

const input = cutoverRequestSchema.parse({
  bucket: process.env.ARTIFACT_BUCKET ?? "next-preview-artifacts",
  sweep_url: process.env.SWEEP_URL,
});

console.log(JSON.stringify(await configureRetention(input), null, 2));
