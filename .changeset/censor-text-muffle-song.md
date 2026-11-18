---
"@vex/vods-core": minor
---

Censor editor: a range can write text over its cover, muffle the sound, or put a looped song from the new song library over it, at a volume. The library (upload, listen, delete) sits under the ranges. Needs a twitch-archive worker with `/api/v2/songs` and the new range keys (`text`, `audio`, `song`, `volume`); against an older worker the library stays empty and saving those keys is refused.
