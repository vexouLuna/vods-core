---
"@vex/vods-core": minor
---

Manage → VOD has a preview (needs twitch-archive with migration 0023): the VOD's file on the server (the source, or
the censored one) or its YouTube uploads, with play/pause, ±1 s and ±1 frame steps and a timeline of the censor
ranges (click to seek, drag a selected range's ends). Only one browser tab on the whole server streams a server file:
another tab sees who has it (Twitch login or "the password login", browser, since when), can use YouTube instead, or
take it over behind a warning; the tab that lost it stops and can take it back. Drafts are never lost.

- Censor ranges can cover only a box drawn, moved and resized over the preview, and cover it (or the whole frame)
  with blur, pixelate, black or any colour (`CensorRange.video` `"pixelate"`/`"color"`, `color`, `region`). The
  preview shows them roughly as they'll look; "Duplicate" makes a second box at the same time.
- The chapters, games and censor times can be set from the preview's playhead and jump it there.
- The dev mock serves the preview's files from `VODS_MOCK_MEDIA` (a local MP4) and runs the same lease.
