---
'@vex/vods-core': minor
---

The home "Latest playthroughs" strip no longer shows an "ongoing" chip, only "complete". An admin can name each gap chapter of a merge: a label per join in Manage's merge panel and on the synthetic VOD page ("Technical difficulties" stays the default). Needs twitch-archive#292 for the merge call's `gapLabels` and the segments' `gap_label`.
