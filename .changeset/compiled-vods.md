---
'@vex/vods-core': minor
---

A synthetic VOD can be compiled into one file: "Compile" on its manage page starts the archive's `compile` job, whose uploads have the new upload type `compiled`. The watch page plays the segments or that file (`?play=segments|compiled`, with a switcher beside the parts menu), defaulting to the new site option `playDefault`, set on /manage/home. `UploadType` and `RawUpload.type` gained `'compiled'`; `useWatch` takes a third `play` argument and returns `hasCompiled`, and `segments` stays set on a synthetic VOD while its compiled file plays. When the segments change after (by hand or a playthrough following its game), the manage page shows the compiled uploads as outdated and offers Recompile (`SyntheticVod.compiled`). A gap between segments no longer stops a compile: the file plays the runs back to back and each upload's `gaps` keeps the timeline right.
