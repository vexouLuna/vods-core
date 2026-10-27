---
"@vex/vods-core": patch
---

The watch page tells a merge or split from a playthrough by its stream count, not by `synthetic.supersedes`, which the
archive stopped setting in its 0022 migration (ADR 0005): a VOD of one stream gets no stream breaks on the seek bar and
keeps P1, P2… part labels. With the twitch-archive fix that numbers a merge as one stream again, a merge's page, and a
playthrough that plays one, show that broadcast as one stream.
