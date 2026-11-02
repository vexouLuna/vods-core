---
"@vex/vods-core": patch
---

Player fixes: seeking back from one clip into an earlier clip of the same video (a multi-clip VOD) no longer skips straight past it while YouTube still reports the old time; and a YouTube player that misses the ready timeout is destroyed, so a late start no longer plays under the "didn't load" error.
