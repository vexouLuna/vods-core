---
"@vex/vods-core": minor
---

Manage: regular and synthetic VODs share one header panel (title, visibility switch, tags, cut reason) on
`/manage/vods/:id` and `/manage/synthetic/:id`. The synthetic page gains its thumbnail, the Actions and the Jobs
panels. Tags are picked with the new `UiTagInput` role, which shows the VOD's states (hidden, synthetic, merged) and
its automatic tags first, locked. The VOD list boxes those states apart from the tags. A site's `ui` now needs a
`TagInput` control (Deep Field maps it to vex-ui's `VxTagInput`; keeki-vods needs a `KTagInput`).
