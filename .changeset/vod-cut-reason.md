---
"@vex/vods-core": minor
---

A VOD can carry why it was cut (`cut_reason` from the archive, `Vod.cutReason`). Manage's Details form edits it, and
the page for a VOD cut in full shows it instead of the generic text when set. Needs twitch-archive with `cutReason`.
