---
"@vex/vods-core": minor
---

Player, progress and chat say what state they're in. `WatchPlayer` has a `buffering` event; `mountYouTube` rejects
when the player isn't ready within `readyTimeoutMs` (15s by default) instead of waiting forever. `ProgressStore.set`
can say where a save went (`SaveStatus`: `saved` with the account, `local` in this browser only, `failed`), which
`LocalProgressStore` and `AccountProgressStore` do, and `useProgress` returns it as `status`. `useChat` returns
`loading` (the first page is on its way) and `noChat` (the VOD has no chat). The watch page shows a spinner while
the video loads, a short "place saved" note, and "Loading chat…" / "This VOD has no chat recording." in chat.
