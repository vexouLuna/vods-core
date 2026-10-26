---
"@vex/vods-core": minor
---

The app moves onto the shared parts. From vex-platform-web v0.13.0: StartJob (StartJobDialog.vue is gone), the admin session on useAdminSession with signInTarget and safeNext, and the job/audit filter helpers. From vex-ui v0.30.0, as new `Ui*` roles every site's `ui` must now hand over: `Confirm`, `DateInput`, `LoadState`, `NavBar`, `PageHead`, `SaveBar`, `StatTile`, `Textarea` (Deep Field maps them to the `Vx*` ones), plus the `.vods-facts` class. Manage's draft editors share `EditorRows` and `TimeStrip`, and the reorderable lists `lib/reorder`. The "Streamed on" date is typed as `YYYY-MM-DD`.
