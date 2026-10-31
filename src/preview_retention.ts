import { z } from "zod";
import type { LifecycleRule } from "./infrai_gateway.js";

export const diagnosticRequestSchema = z.object({
  build: z.object({
    build_id: z.string().min(1),
    artifact_key: z.string().regex(/^previews\/[a-zA-Z0-9._/-]+$/),
    completed_at: z.string().datetime(),
  }),
  release: z.object({
    operation_id: z.string().min(1),
    build_id: z.string().min(1),
    action: z.enum(["preview-created", "promoted-to-production", "preview-closed"]),
  }),
  observed_at: z.string().datetime(),
});

export const cutoverRequestSchema = z.object({
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  sweep_url: z.string().url(),
});

export type DiagnosticRequest = z.infer<typeof diagnosticRequestSchema>;
export type CutoverRequest = z.infer<typeof cutoverRequestSchema>;

export const previewLifecycleRules: LifecycleRule[] = [
  { prefix: "previews/", expire_days: 1 },
];

export function diagnoseBuild(input: DiagnosticRequest) {
  if (input.build.build_id !== input.release.build_id) {
    return {
      decision: "investigate" as const,
      artifact_key: input.build.artifact_key,
      message: `Release ${input.release.operation_id} refers to a different build`,
    };
  }

  if (input.release.action === "promoted-to-production") {
    return {
      decision: "retain" as const,
      artifact_key: input.build.artifact_key,
      message: `Build ${input.build.build_id} is attached to a production release`,
    };
  }

  const expiresAt = new Date(new Date(input.build.completed_at).getTime() + 86_400_000);
  const expired = new Date(input.observed_at).getTime() >= expiresAt.getTime();
  return {
    decision: expired ? ("expire-now" as const) : ("retain-until" as const),
    artifact_key: input.build.artifact_key,
    expires_at: expiresAt.toISOString(),
    message: expired
      ? `Preview build ${input.build.build_id} has reached its 24-hour TTL`
      : `Preview build ${input.build.build_id} remains available until ${expiresAt.toISOString()}`,
  };
}
