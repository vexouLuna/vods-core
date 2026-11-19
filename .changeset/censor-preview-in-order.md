---
"@vex/vods-core": patch
---

Manage → VOD's preview shows and plays the censor ranges as the worker now makes them: in the list's own order (no longer sorted on save; ↑ ↓ in the censor editor reorder them), each over the ones before. Boxes, text size and outline, and the blur radius come from the worker's own maths in the frame's pixels, the text measured and drawn in the worker's font (DejaVu Sans Bold, shipped unmodified with its licence and loaded only by the preview); the sound is silenced, muffled (ffmpeg's two 400 Hz low-passes) or replaced by the library song looped from its range's start at its volume. The editor's help says ranges apply in list order.
