---
'@vex/vods-core': patch
---

Manage: a blocked or rejected upload in the YouTube check gets "Fix claim…", which links the video's Copyright page in YouTube Studio and takes the `receivedClaims` pasted from it to the worker's part DMCA job (mute or black out, upload the part again).
