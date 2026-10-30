---
'@vex/vods-core': minor
---

The account progress store and the admin code exchange now use vex-auth's `/v2` (`/v2/progress`, `/v2/codes`, `/v2/me`): snake_case entries with ISO `updated_at`, the progress list followed page by page, merge answered with 204, and `X-CSRF-Token` on the code request. A site takes this together with a `@vex/ui` whose `account.request()` sends `X-CSRF-Token`, which `/v1` refuses. `Progress` is unchanged.
