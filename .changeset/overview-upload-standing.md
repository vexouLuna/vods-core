---
'@vex/vods-core': minor
---

Overview: the YouTube tile shows what decides whether uploads are allowed (the channel's long-upload status, whether
it is linked, its privacy and the granted scopes), warning on what makes YouTube refuse an upload; and a "Twitch app"
tile shows the app client the censor check uses (masked id, whether it gets a token), apart from the ad-free account.
New `Health` fields `youtube.channel.status`, `youtube.grantedScopes` and `twitchApp`, read from twitch-archive's
`/admin/health` (vexouLuna/twitch-archive#215); an older worker leaves them out and the tiles look as before.
