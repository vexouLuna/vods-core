---
"@vex/vods-core": minor
---

A compilation's segments panel has a "Follows" field while "Keep up to date" is on: the games it follows, by name, with
a game search to add more and × to drop one. Saving sends `auto: { game_ids }` and the archive rebuilds the segments
from every window of any of them, oldest VOD first. Needs twitch-archive#239 on the server. `SyntheticVod.auto` is now
`{ game_ids } | { game_id } | null` (an older row keeps `game_id`); `followedGames(auto)` reads either. The dev mock
rebuilds a followed compilation's segments, loads the public archive's synthetic VODs, and takes `game_id` more than
once for playthrough candidates.
