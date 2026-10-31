---
"@vex/vods-core": minor
---

Manage overview: every status tile is there from the first paint, saying Loading until its answer comes. The stream
moves out of the tiles into its own row above them, with links to the running live and archive captures and the job
counts by state (the Jobs section it replaces is gone). Stuck VODs leave out the ones whose every chapter was cut
(`fully_cut=false` on the VOD list; a worker without that filter ignores it and lists them as before). The frame around
a VOD's states on /manage/vods takes its radius from the new `--vods-radius-group` token (default `999px`).
