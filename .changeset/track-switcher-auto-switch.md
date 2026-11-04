---
"@vex/vods-core": minor
---

Watch page: a VOD with both a live recording and Twitch's VOD gets a Track switch (Unmuted | Muted) in the player settings, at the same moment. The track picked there is remembered in the browser and used for the following parts and videos; with no pick it's Unmuted. When a part can't play, a big centred card (like the next-stream handoff) counts down (stoppable, 8 s) to the same moment on the other track, for that part only: the next part goes back to the picked track. When no track has it (a track that already failed there is never picked again), it counts down twice as long (16 s) to the next part.
