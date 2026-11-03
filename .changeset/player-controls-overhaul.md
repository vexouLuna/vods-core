---
"@vex/vods-core": minor
---

Watch page: no site header (a back button over the player instead) and the title and day along the bottom of the
controls. Theater mode is gone: an arrow on the controls' top edge collapses them, and the same arrow over the video
brings them back (`h` too). Volume is one control: a small window with a vertical slider above the button, on hover
or a tap, over the bar so the row never moves; with a mouse the button mutes. Player settings gets a captions switch
and holds copy link, download and the keyboard shortcuts. On phones the related VODs (a playthrough's streams, the
playthroughs a VOD is in) are in the part picker's menu, so the bar fits one row. The settings icon is a gear (chat
settings too). Chat width gets a "Largest video" setting. The game marks above the seek bar are gone and part changes
are a dotted line through the bar. The buttons over the video have no background and fade after 2s without the
pointer moving over the player. The next-stream and end-of-VOD cards put their buttons beside the countdown again.

Fixes: a YouTube player that throws while being made no longer leaves its 15s timer running; a hand-edited saved
emote setting that isn't a boolean is ignored; the player no longer throws on load while YouTube has no volume to
report yet, so `mountYouTube` resolves.

New token `--vods-player-control` (32px): the control bar's button height, for a theme to put on its controls in
`.vods-player-controls`, so every site's bar has the same sizes. A site's theme should map it (keeki-vods does).
