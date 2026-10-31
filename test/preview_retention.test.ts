import { describe, expect, it } from "vitest";
import { diagnosticRequestSchema, diagnoseBuild } from "../src/preview_retention.js";

describe("preview artifact retention", () => {
  const build = {
    build_id: "build-checkout-184",
    artifact_key: "previews/checkout/build-checkout-184.zip",
    completed_at: "2026-09-01T10:00:00.000Z",
  };

  it("expires an ordinary preview after its TTL", () => {
    const input = diagnosticRequestSchema.parse({
      build,
      release: {
        operation_id: "release-92",
        build_id: build.build_id,
        action: "preview-closed",
      },
      observed_at: "2026-09-02T10:00:00.000Z",
    });

    expect(diagnoseBuild(input)).toMatchObject({
      decision: "expire-now",
      expires_at: "2026-09-02T10:00:00.000Z",
    });
  });

  it("retains the same build when a release promotes it", () => {
    const input = diagnosticRequestSchema.parse({
      build,
      release: {
        operation_id: "release-93",
        build_id: build.build_id,
        action: "promoted-to-production",
      },
      observed_at: "2026-09-05T10:00:00.000Z",
    });

    expect(diagnoseBuild(input).decision).toBe("retain");
  });
});
