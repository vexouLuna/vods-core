---
'@vex/vods-core': minor
---

Bot-chat notices that carry the chatter's own message (a resub's) now show their system line over a normal chat line,
with the chatter's colour, badges and emotes. Chat lines carry Twitch's message type (`messageType`: highlighted,
intro, gigantified emote, message effect), and GIFs come through as `gif` tokens (`GifToken`). Needs
@vex/platform-web with chat message types.
