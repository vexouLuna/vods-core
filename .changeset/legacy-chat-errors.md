---
"@vex/vods-core": patch
---

Chat replay treats the archive's new "No chat at or after offset" answer as an empty page, as it did the old "Failed to retrieve comments from offset" one. The dev admin mock's toasts and errors use the archive's current wording.
