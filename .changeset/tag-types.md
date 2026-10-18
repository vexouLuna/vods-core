---
'@vex/vods-core': minor
---

- Tag types: a tag on /manage/tags can have its own page and menu entry (`page`, `pageLabel`) and can feed a
  homepage card (`homeCard`). Playthroughs is now the `compilation` tag's page; a new type (highlights, say) needs
  only its tag set up. A path no tag has is "not found".
- Breaking for kit users: `TABS` is gone; `tabs()` lists the list pages from the tag config.
