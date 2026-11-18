---
"@vex/vods-core": patch
---

Manage → VOD's preview shows and plays the censor ranges as the worker now makes them: in the saved order, each over the ones before. Boxes, text size and outline, and the blur radius come from the worker's own maths in the frame's pixels; the sound is silenced, muffled (ffmpeg's two 400 Hz low-passes) or replaced by the library song looped from its range's start at its volume. The editor's help says ranges apply in list order.
