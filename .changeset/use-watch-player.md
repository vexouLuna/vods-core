---
"@vex/vods-core": minor
---

`useWatchPlayer` (vue entry): a watch page's player without a look, so a site with its own watch page doesn't copy
the app's wiring. It mounts the YouTube player across a VOD's parts and returns its state as refs (`time`,
`playing`, `buffering`, `rate`, `volume`, `muted`, `partIndex`, `status`, `error`), the controls (`seek`,
`playPart`, `togglePlay`, `setVolume`, `toggleMute`, `setRate`…), chat replay in step with it, and watch progress
(`resume`, `saved`). `useWatchView` is now the app's layer over it. `chatSourceFor` moved to the vue entry
(`useChatSettings` still re-exports it).
