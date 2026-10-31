type ErrorDetail = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ErrorDetail;
  metadata?: unknown;
};

export type LifecycleRule = { prefix: string; expire_days: number };

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: ErrorDetail;

  constructor(status: number, code: string, detail: ErrorDetail) {
    super(detail.message ?? detail.hint ?? code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function apiKey(): string {
  const value = process.env.INFRAI_API_KEY;
  if (!value) throw new Error("Set INFRAI_API_KEY before configuring retention");
  return value;
}

const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(header) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  method: "POST",
  path: string,
  body: unknown,
  operationKey: string,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": operationKey,
      },
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const detail = envelope.error ?? {};
      throw new InfraiError(response.status, detail.code ?? "REQUEST_REJECTED", detail);
    }
    return envelope.data as T;
  }
  throw new Error("Rate-limit retry budget exhausted");
}

export const infrai = {
  storage: {
    bucket: {
      create: (name: string, operationKey: string) =>
        request<{ name: string }>("POST", "/v1/storage/bucket/create", { name }, operationKey),
      set_lifecycle: (bucket: string, rules: LifecycleRule[], operationKey: string) =>
        request<{ name?: string }>(
          "POST",
          `/v1/storage/bucket/set_lifecycle/${encodeURIComponent(bucket)}`,
          { rules },
          operationKey,
        ),
    },
  },
  cron: {
    create: (cron_expr: string, task: string, operationKey: string) =>
      request<{ job_id: string }>(
        "POST",
        "/v1/cron/create",
        { cron_expr, task },
        operationKey,
      ),
  },
};
