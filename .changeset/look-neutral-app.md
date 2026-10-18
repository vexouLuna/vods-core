---
'@vex/vods-core': minor
---

The app is look-neutral: its pages use `Ui*` controls that the site hands to `createVodsApp({ ui })`, and style
themselves with `--vods-*` tokens and `vods-*` utility classes (`styles/tokens.css`). Deep Field moves to the new
`@vex/vods-core/deep-field` entry (`deepField`, plus `@vex/vods-core/deep-field.css`). Breaking: `ui` is required, and
the app no longer imports `@vex/ui/platform.css` or styles `vx-*` classes itself.

`art.playhead` swaps the timeline's snail for the site's own playhead.
