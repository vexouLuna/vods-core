---
"@vex/vods-core": minor
---

The tag model of twitch-archive's ADR 0005 (needs twitch-archive with migration 0022):

- A tag with a page is a home category: Manage → Tags has one "Home category" switch (sets the page and its title), and the homepage drops a tag card whose tag isn't one, whatever was saved.
- /vods lists the `vods` tag when the archive has it (every VOD, merges and splits too), else the archive's default list. `vods` and `compilation` are never chips. `playthroughs` replaces `compilation` in the built-in tags and the default homepage.
- New homepage card "Latest VOD" (`{kind: "one", tag}`): a home category's newest VOD in the big panel. The others read "Latest live" and "Latest 2".
- Merge panel: suggestions within 24 h either side, add or remove VODs by id, one gap per join (filled from the start times), a custom id (default `<first id>-m`), one Merge button. Split takes custom ids. Both use `/api/v2` (the old `/admin` routes are gone from the archive).
- Synthetic VOD page: no "Played to the end" or "Stands in for its sources" checkboxes; "Hide all sources" / "Show all sources"; the site's tags as one-click suggestions; the playthrough builder adds `playthroughs`.
- A hidden VOD that two or more synthetic VODs play opens a page listing them (`Vod.hidden`); one that one plays still redirects.
- The tag colour hint suggests `var(--vods-tag-new)`, which every site defines (#93).
