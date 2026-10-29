---
"@vex/vods-core": minor
---

Watch page: YouTube's own controls are hidden by default; a "YouTube controls" switch in the new player settings
brings them back (remembered in this browser). The page has its own play/pause and mute buttons, and the settings
add volume and playback speed (0.5–2×). `WatchPlayer` gains `setVolume`, `setMuted`, `setRate` and a `volume`
event, and keeps the chosen speed across parts; `PlayerLike` now needs `setVolume`, `getVolume`, `setPlaybackRate`
and `getPlaybackRate` (YT.Player has them). The seek bar and part labels are 24px to hit (the bar still looks thin),
the controls use drawn icons instead of text glyphs, the shortcuts button is hidden on touch screens, and `m` mutes.
