---
'@vex/vods-core': minor
---

A synthetic VOD can be compiled into one file: "Compile" on its manage page starts the archive's `compile` job, whose uploads have the new upload type `compiled`. The watch page plays the segments or that file (`?play=segments|compiled`, with a switcher beside the parts menu), defaulting to the new site option `playDefault`, set on /manage/home. `UploadType` and `RawUpload.type` gained `'compiled'`; `useWatch` takes a third `play` argument and returns `hasCompiled`, and `segments` stays set on a synthetic VOD while its compiled file plays.
