---
'@vex/vods-core': minor
---

- A VOD cut in full gets its own page (what was cut and why) instead of "no VOD uploads yet".
- While the channel is live, the home page shows the stream (Twitch preview, LIVE tag, its VOD page) in the latest
  VOD's place. New `ArchiveClient.liveStatus()` and `LiveStatus` type (`/v1/status`).
- Signed-in admins get a 🔧 on each VOD card, the latest VOD and the watch page, to that VOD's Manage page.
- Tags take a `rotate` (degrees; unset keeps the −4° tilt), set on /manage/tags. Needs twitch-archive to store it;
  an archive without it drops the field.
- /manage/storage's disk bar splits the archive's folders, stale folders and everything else.
- adminMock: `MOCK_LIVE=yes` and `MOCK_FULLY_CUT=<vod id>`.
