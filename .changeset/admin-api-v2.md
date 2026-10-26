---
'@vex/vods-core': minor
---

The dashboard's settings, storage and VOD writes (details, games, chapters, YouTube and Drive lists, censor ranges,
deleting uploads, re-archiving, the censor review) and its emotes read go to twitch-archive's `/api/v2` instead of
`/admin` (vexouLuna/twitch-archive#216, which a worker must have before a site takes this). `RuntimeSetting`,
`StorageView` and `AdminEmotes` are in v2's snake_case, and `settings()` answers `{ items }`. A write that answers a
VOD still reads it from `GET /admin/vods/:id`, so the editors keep one shape.
