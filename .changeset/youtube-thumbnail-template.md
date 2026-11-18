---
'@vex/vods-core': minor
---

Manage gets a Thumbnails page (`/manage/thumbnails`, optional `manage.thumbnails` page): the YouTube thumbnail template's
lines of text with `{fields}` over a frame of the part, a live preview drawn by the worker, saving, and a button that
makes the thumbnails again for a VOD's existing uploads. `AdminClient` gains `thumbnailTemplate`,
`saveThumbnailTemplate`, `thumbnailPreview` and `thumbnailsAgain`. Needs a twitch-archive worker with
`/api/v2/thumbnail`. No new `Ui*` controls.
