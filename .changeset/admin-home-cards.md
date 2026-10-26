---
"@vex/vods-core": minor
---

Manage → Homepage: "Add a card" offers Latest live, Latest VOD, Latest 2 and Most played games, and each Latest card
picks its tag in its own dropdown ("All VODs" or a home category). Any card can be on the page twice, 12 cards at
most. Cards are `{id, type, tag?, count?}`, read from the archive's
`cards` and saved as `cards`; against an archive without `cards`, the homepage and `/manage/home` read its old
`{kind, tag}` `homeCards`, and `/manage/home` saves that shape (one of each). The "A synthetic VOD with a compiled
upload plays" setting moves to a "Watch page" group on Manage → Settings, with its own Save.
