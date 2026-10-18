@.conventions/CLAUDE.md

# vods-core

The engine and the app behind the vods sites (vods.vexoul.net, keekivods.vexoul.net). The root and `vue` entries
are headless: archive API client, part and restricted-chapter time math, YouTube player control, chat replay and
watch progress, with no components or styles. The `app` entry (`src/app/`) is the site itself: its pages, the
Manage dashboard, the router and `createVodsApp()`. The app has no look of its own: its templates use unimported
`Ui*` controls and `--vods-*` tokens / `.vods-*` classes, and each site hands `createVodsApp()` its controls (`ui`)
and defines the tokens. The `deep-field` entry (`src/app/deep-field/`, plus `deep-field.css`) is vods.vexoul.net's
Deep Field set; keeki-vods brings its own. Each site repo keeps only its config, branding, look and `main.ts`,
so anything a site needs that both could use goes here, not in the site. Generic components belong in vex-ui.
The sites install a tag (`github:vexouLuna/vods-core#vX.Y.Z`), so a change reaches them only when a release is tagged
on `main` and their pins move.

- Time math (parts, restricted chapters, the start delay) gets a test, ideally against a real VOD
  fixture in `tests/fixtures/`. `npm run fixtures` refreshes them from the public archive API, with
  chatters' names replaced by placeholders; keep it that way.
- A change to `src/` adds a changeset (`npm run changeset`). Releases go through a `release/x-y-z`
  branch, and the tag is set on `main` after it merges (README).
- Exports in `package.json` are a contract with the sites; renaming or removing one is a minor bump
  before 1.0.
- Nothing in `src/app/` names a site: per-site values (name, Twitch link, tags, the vex-ui site id)
  come from `createVodsApp()`'s options through `src/app/site.ts`, read when they're used, not when a
  module loads.
- The root and `vue` entries never import from `src/app/`.
- Only `src/app/deep-field/` imports `@vex/ui`'s components or styles or uses `--vx-*`. The rest of `src/app/` uses
  `Ui*` controls and `--vods-*`/`.vods-*`; a new token gets a default in `tokens.css` and a mapping in both sites.
- A new `Ui*` control or a new prop on one reaches every site: add it to `ui.ts` and tell keeki-vods, whose `K*`
  controls must match (their templates are only type-checked against the `Vx*` ones).
- The `kit` entry (logic without components, `tests/app/kit.test.ts`) has no site left since keeki-vods runs the app;
  it can go in a later minor.
