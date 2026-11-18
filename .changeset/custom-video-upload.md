---
"@vex/vods-core": minor
---

Manage → Upload: send a video with no Twitch VOD behind it to YouTube through the censor step. The file goes up in chunks with progress, pauses and resumes (also after a reload: pick the same file again), then becomes a hidden `upload-…` VOD that waits for review on its VOD page; Upload to YouTube sends it and the page shows the link. The VOD list gets a "Custom" kind filter and chip. Adds the optional `manage.upload` page to `VodsPages`. Needs a twitch-archive worker with `/api/v2/uploads`.
