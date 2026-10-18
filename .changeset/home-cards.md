---
'@vex/vods-core': minor
---

Homepage cards come from the archive (`GET /v1/site/options`): which cards show and in what order (the latest VOD, the newest VODs with a tag, the most played games). The new Manage page `/manage/home` edits them, so `pages.manage` needs a `home` entry. `LatestPlaythroughs` became `LatestTagged`, which takes a `tag`.
