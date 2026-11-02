---
"@vex/vods-core": minor
---

VOD lists: the search box ("Search VODs or games…") matches chapter game names as well as titles (`search` in `VodListOptions`); a "Hide cut" filter leaves out VODs cut in full (`hideCut`, the archive's `$cut=false`; an older archive ignores it); a VOD cut in full shows "Cut · Not on YouTube" on its card, dimmed, with no length or NEW stamp. New site option `vodTitle: 'original' | 'generated'`: generated headlines a plain VOD with its date and games (stream title moves to the small line), and viewers can switch in the list's View menu (kept in this browser). Home: the hero skips cut VODs and, under a short chapter list, shows the few VODs before it; the latest-playthrough cards drop the repeated line under the title and the second "complete".
