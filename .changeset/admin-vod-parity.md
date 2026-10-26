---
"@vex/vods-core": minor
---

Manage: regular and synthetic VODs share one header panel (title, visibility switch, tags, cut reason) on
`/manage/vods/:id` and `/manage/synthetic/:id`. The synthetic page gains its thumbnail, the Actions and the Jobs
panels (on a synthetic VOD, Actions only says its Twitch and YouTube jobs run on its sources); its thumbnail is read from the archive's `synthetic.thumbnailUrl` (`RawSynthetic.thumbnailUrl`), and empty
means its first source's. Tags are picked with the new `UiTagInput` role, which shows the VOD's states (hidden, synthetic, merged) and
its automatic tags first, locked. The VOD list boxes those states apart from the tags. A site's `ui` now needs a
`TagInput` control (Deep Field maps it to vex-ui's `VxTagInput`; keeki-vods needs a `KTagInput`).

Manage → Settings: list settings are edited with the same tag input (type, then Enter or comma) instead of one per line.
