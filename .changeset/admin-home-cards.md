---
"@vex/vods-core": minor
---

Manage → Homepage: "Add a card" offers Latest live, Latest VOD, Latest 2 and Most played games, and each Latest card
picks its tag in its own dropdown ("All VODs" or a home category). The same card can be on the page twice. Cards are
`{id, type, tag?, count?}` now; the homepage and `/manage/home` still read the archive's old `{kind, tag}` cards, and
`/manage/home` saves that shape (one of each) to an archive that only has it. The "A synthetic VOD with a compiled
upload plays" setting moves to a "Watch page" group on Manage → Settings, with its own Save.
