---
'@vex/vods-core': patch
---

Fix admin and chat-replay bugs from the bug hunt: a media lease claimed after the page was left is released; slow VOD/emote/synthetic loads no longer overwrite a newer one; the game search no longer picks a stale result on Enter; chat replay keeps comments when a page fetch fails; "set from playhead" clears unreadable time text; removing a selected censor range clears the selection; the tag save bar counts a removal plus an addition as 2; the preview clock shows the right tenth; home cards never share an id.
