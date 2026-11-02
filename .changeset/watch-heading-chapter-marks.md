---
'@vex/vods-core': minor
---

Watch page: a heading strip above the player (under it on phones; gone in theater mode) with the full title as an
`h1`, the day, the length and the games. The timeline labels each chapter's game (box art, alone when it's crowded)
or each playthrough stream's day instead of YouTube parts, draws a line where the game changes, and moves part ticks
to a hairline under the bar. A playthrough's parts read "Stream 2 · Aug 9 · part 1 of 2" instead of "S2-P1", and
the chapter line drops "ch n/n" when there's one chapter per stream. New tokens `--vods-player-heading`,
`--vods-player-text` and `--vods-player-time`, and a `.vods-player-controls` hook on the control bar where a theme
can size its controls. The Player settings popover is wide enough for the speed row.
