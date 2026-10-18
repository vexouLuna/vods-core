---
"@vex/vods-core": patch
---

Deep Field panels, headings and buttons match vex-ui v0.27.0 again: panels get the window reflection and the lit rim, headings take the accent-tinted gradient, and buttons have the glass edge instead of a blur. A test now checks each copied rule against the installed @vex/ui, so a vex-ui change can't drift unnoticed. Solid buttons ("See all", "Stop timer") drop the glass edge.
