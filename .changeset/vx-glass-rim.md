---
"@vex/vods-core": patch
---

Deep Field panels use vex-ui v0.28.0's shared glass instead of copying it: `.vods-panel` takes `--vx-glass-panel`, and every panel carries vex-ui's `.vx-glass-rim` class for the lit rim (inert off Deep Field). The page sky now stays put on screen while scrolling (from vex-ui v0.28.0). No other visual change.
