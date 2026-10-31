---
"@vex/vods-core": minor
---

Watch page: the volume button opens a vertical slider with the percentage and mute; the "place saved" note is gone;
YouTube's own controls are on by default (a saved choice stays); in theater mode the "show controls" tab sits over the
video's bottom edge instead of taking a strip under it. The player keeps a seek's target as the time until YouTube
reaches it (the playhead no longer jumps to the part's start while a part loads), and mute toggles from what was last
asked for, so one click is enough while paused. `WatchPlayer` gains `toggleMuted()`.
