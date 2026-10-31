import { infrai } from "./infrai_gateway.js";
import { previewLifecycleRules, type CutoverRequest } from "./preview_retention.js";

export async function configureRetention(input: CutoverRequest) {
  const identity = `preview-retention:${input.bucket}:v1`;
  await infrai.storage.bucket.create(input.bucket, `${identity}:bucket`);
  await infrai.storage.bucket.set_lifecycle(
    input.bucket,
    previewLifecycleRules,
    `${identity}:policy`,
  );
  const schedule = await infrai.cron.create(
    "17 * * * *",
    input.sweep_url,
    `${identity}:sweep`,
  );
  return {
    bucket: input.bucket,
    policy: "previews-expire-after-one-day",
    sweep_job_id: schedule.job_id,
  };
}

export async function reconcileRetention(bucket: string) {
  await infrai.storage.bucket.set_lifecycle(
    bucket,
    previewLifecycleRules,
    `preview-retention:${bucket}:reconcile:v1`,
  );
  return { bucket, policy: "active", rule_count: previewLifecycleRules.length };
}
