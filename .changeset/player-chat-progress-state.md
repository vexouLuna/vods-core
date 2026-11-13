---
"@vex/vods-core": patch
---

Fix player, chat and progress state slips: a seek to another part while YouTube buffers or starts a part keeps
playing instead of stopping; `playing` turns false when a part fails; a new player clears the last one's load
`error`; chat follows a seek or a change of source VOD while paused instead of staying stale or blank; and, signed
in, a save the account missed (kept in the browser) is offered back when the account has none or an older one.
