---
'@vex/vods-core': patch
---

The admin mock (`@vex/vods-core/dev`) takes `payload` on `PATCH /api/v2/jobs/{id}` the way vex-platform 0.12 does
(any run not running; a 409 when `expected_updated_at` is stale), audits it as `job.payload.update`, and seeds a
finished `reupload` run with an `uploaded` part to try the job page's payload editor on.
