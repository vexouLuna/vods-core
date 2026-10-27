---
'@vex/vods-core': minor
---

Remove the games rows (the old per-game YouTube uploads), which nothing writes any more. **Breaking:** `Vod.games` and
the `GameUpload` type are gone, `normalizeVod` no longer reads `games`, `AdminClient.games()`/`saveGames()` and the
`GameRow` type are gone, and `VodsPages` has no `games` page (a site passing one fails its type check; drop it). The
`/games/:id` route and page are gone, and the admin VOD page loses its Games tab. `/v1/games-played` (the most played
lists) and the chapters' game picker are unchanged. Release this before twitch-archive stops sending `games`; an older
API that still sends it is fine, the field is ignored.
