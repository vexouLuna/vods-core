---
"@vex/vods-core": minor
---

Manage → VOD: a Timeline workbench keeps the preview in view beside the Chapters, Games and Censor editors, which
now sit under tabs. On wide screens the preview is a sticky left column; on phones it sticks to the top edge at a
smaller height. Each tab shows its row count, and a draft reads "Chapters 7 → 6 •" (on phones "Chapters 7→6•"). A link to `#censor` opens the
Censor tab and scrolls to the panel. YouTube parts, Drive files and Emotes follow it, unchanged. The three editors
emit `draft` (row count, unsaved) as their drafts change.
