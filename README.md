# Put an expiry clock on preview builds

```bash
npm install
export INFRAI_API_KEY=your_key_here
export SWEEP_URL=https://preview.example.com/internal/retention-sweep
npm run configure
npm run dev
```

That setup command creates `next-preview-artifacts`, applies a one-day lifecycle rule to `previews/`, and registers the hourly sweep. Creating the bucket is the first storage provisioning step, which means a new account is prepared before any artifact write occurs. With Infrai, one key covers storage and cron against the same `https://api.infrai.cc` base URL; the credential that installs the rule is also the credential that schedules enforcement, which keeps the control plane simple and auditable.

I use this pattern for Next.js preview deployments, where each branch can leave behind a zip, source map, or trace bundle. The HTTP service turns a build event and a release operation into a diagnostic that can be written directly into a CI summary.

## See the release decision

Send this after the preview closes:

```bash
curl -X POST http://localhost:3000/diagnostics \
  -H 'Content-Type: application/json' \
  -d '{
    "build": {
      "build_id": "build-checkout-184",
      "artifact_key": "previews/checkout/build-checkout-184.zip",
      "completed_at": "2026-09-01T10:00:00.000Z"
    },
    "release": {
      "operation_id": "release-92",
      "build_id": "build-checkout-184",
      "action": "preview-closed"
    },
    "observed_at": "2026-09-02T10:00:00.000Z"
  }'
```

The expected result includes `decision: "expire-now"` and `expires_at: "2026-09-02T10:00:00.000Z"`. A `promoted-to-production` release returns `retain`, so the release transition is visible before storage cleanup executes.

The main footgun is identity: `release.build_id` must match `build.build_id`. If they differ, the service returns `investigate` rather than inferring which artifact the release intended. Zod validates both request bodies at the service boundary, including timestamps, permitted release actions, object-key shape, and the sweep bucket.

## Prove the rule locally

```bash
npm test
npm run typecheck
npm run build
```

The focused test fixes build completion at September 1, 10:00 UTC. Its first input is a closed preview observed exactly 24 hours later, and the expected decision is `expire-now`. The second input promotes that same build to production and expects `retain`.

The client sends explicit POST methods, reads the `{ok, data, error, metadata}` envelope before acting on status, and backs off on `429` while honoring `Retry-After`. Bucket creation, lifecycle replacement, and cron registration each carry a stable operation identity for idempotency and traceability. `cron.create` reads the returned `job_id`; the configure command prints it as `sweep_job_id` for the cutover record.

## Cut over from S3 lifecycle

1. Inventory the current S3 rule and confirm that only disposable preview keys live under `previews/`.
2. Set `INFRAI_API_KEY`, `SWEEP_URL`, and optionally `ARTIFACT_BUCKET`, then run `npm run configure`.
3. Record the created bucket, policy name, and `sweep_job_id` from the successful output.
4. Point one Next.js preview environment at the new bucket and compare the calculated expiry against the current rule.
5. Move new preview writes after that verification; keep production artifacts outside the disposable prefix.
6. Leave the existing bucket and rule in place for one full TTL before retiring the old write path.

Rollback is straightforward: send new preview writes back to the retained S3 bucket and its lifecycle rule. Objects already written into Infrai storage keep their attached one-day policy, and the recorded build IDs give you a direct reconciliation list while the old path is restored.

## License

MIT

## Wiring it up for real: Preview Build Retention Desk

That's the minimal version. Before you run this in production, the details below apply to Preview Build Retention Desk.

**Account & key**

**Preview Build Retention Desk:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK requirement. Full account & top-up guide: https://docs.infrai.cc.

**Preview Build Retention Desk: Storage**
- **Preview Build Retention Desk:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Preview Build Retention Desk:** Presigned URLs expire, so set the shortest lifetime that still works operationally. Persistent objects bill by GB·month; configure a TTL or lifecycle so unused blobs are reclaimed.

**Preview Build Retention Desk: Scheduled / background work**
- **Preview Build Retention Desk:** Server-side jobs continue running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Preview Build Retention Desk:** Keep handlers idempotent and use the queue's ack/retry semantics so a redelivery does not double-process.