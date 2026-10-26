// The site's own options from the archive (GET /v1/site/options): which cards the homepage shows, in order (edited on
// /manage/home), and which version of a compiled synthetic VOD plays first (on /manage/settings). Until the archive answers (or an archive without them), the defaults.
import { shallowRef } from 'vue'
import { vodsConfig } from '../site'
import type { TagStyle } from '../site'
import { TAG_NAME } from './tagRules'
import { VODS_TAG } from './vodTags'

/**
 * One homepage card: "Latest live" (`live`: the stream while live, else the newest VOD), "Latest VOD" or "Latest 2"
 * (`vods` with `count` 1 or 2: the newest of a tag, never the stream; `vods` itself is every VOD), or the most played
 * games. `id` tells cards apart: two of the same type and tag can both be on the page. A tag card shows only while its
 * tag is a home category (shownHomeCards).
 */
export type HomeCard = HomeCardBody & { id: string }
export type HomeCardBody = { type: 'live' } | { type: 'vods'; tag: string; count: 1 | 2 } | { type: 'games' }

/** The cards as an archive without per-card settings stores them (`kind`), still taken by every archive's PUT. */
export type LegacyHomeCard = { kind: 'latest' } | { kind: 'one'; tag: string } | { kind: 'tag'; tag: string } | { kind: 'games' }

/** A synthetic VOD with a compiled upload plays its segments (each source's own uploads) or that one file. */
export type PlayDefault = 'segments' | 'compiled'

export interface SiteOptions {
  homeCards: HomeCard[]
  playDefault: PlayDefault
}

/** GET /admin/site/options: the options as the archive stores them, and who last changed them (docs/admin-api.md,
 * "Site options"). An archive with per-card settings sends them as `cards` (homeCards in the old shape alongside). */
export interface SiteOptionsView {
  homeCards: unknown
  cards?: unknown
  playDefault: PlayDefault
  updatedAt: string | null
  updatedBy: string | null
}

export const DEFAULT_SITE_OPTIONS: SiteOptions = {
  homeCards: [{ id: 'c0', type: 'live' }, { id: 'c1', type: 'vods', tag: 'playthroughs', count: 2 }, { id: 'c2', type: 'games' }],
  playDefault: 'segments',
}

export const siteOptions = shallowRef<SiteOptions>(DEFAULT_SITE_OPTIONS)

/** The most cards the archive keeps; `live` and `games` at most once each. */
export const MAX_HOME_CARDS = 12

/** A short random key for a new card (the archive takes 1-32 of [A-Za-z0-9_-]). */
export const newCardId = (): string => Math.random().toString(36).slice(2, 10)

/** A card type's name on /manage/home. */
export const homeCardTypeLabel = (c: Pick<HomeCard, 'type'> & { count?: 1 | 2 }): string =>
  c.type === 'live' ? 'Latest live' : c.type === 'games' ? 'Most played games' : c.count === 1 ? 'Latest VOD' : 'Latest 2'

/** A tag's name in the card's dropdown: "All VODs" for `vods`, else its page title or label. */
export function homeTagLabel(tag: string, tags: Record<string, TagStyle>): string {
  if (tag === VODS_TAG) return 'All VODs'
  const s = tags[tag]
  return s?.pageLabel ?? s?.label ?? tag
}

/** A card's name: "Latest live", "Most played games", or "Latest VOD: " / "Latest 2: " and the tag's name. */
export function homeCardLabel(c: HomeCard, tags: Record<string, TagStyle>): string {
  return c.type === 'vods' ? `${homeCardTypeLabel(c)}: ${homeTagLabel(c.tag, tags)}` : homeCardTypeLabel(c)
}

/** The cards to draw: a tag card only while its tag is a home category (has a page) or is `vods`, whatever was saved. */
export const shownHomeCards = (cards: HomeCard[], tags: Record<string, TagStyle>): HomeCard[] =>
  cards.filter((c) => c.type !== 'vods' || c.tag === VODS_TAG || !!tags[c.tag]?.page)

/** One stored card, in either shape, as a card (without its id); null when it's neither. */
function cardOf(c: Record<string, unknown> | null): HomeCardBody | null {
  const tag = typeof c?.tag === 'string' && TAG_NAME.test(c.tag) ? c.tag : null
  switch (c?.type ?? (c?.kind === 'latest' ? 'live' : c?.kind === 'one' || c?.kind === 'tag' ? 'vods' : c?.kind)) {
    case 'live': return { type: 'live' }
    case 'games': return { type: 'games' }
    case 'vods': {
      const count = 'type' in c! ? (c.count === 1 ? 1 : c.count === 2 ? 2 : null) : c!.kind === 'one' ? 1 : 2
      return tag && count ? { type: 'vods', tag, count } : null
    }
    default: return null
  }
}

/**
 * The cards the site can draw, in order, from the archive's new shape (`{id, type, …}`) or its old one (`{kind, tag}`),
 * which is mapped (`latest` → `live`, `one` / `tag` → `vods` with `count` 1 / 2). Anything else is dropped; a missing
 * or repeated id gets a new one.
 */
export function homeCardsOf(raw: unknown): HomeCard[] {
  if (!Array.isArray(raw)) return DEFAULT_SITE_OPTIONS.homeCards
  const out: HomeCard[] = []
  for (const [i, c] of (raw as Array<Record<string, unknown> | null>).entries()) {
    const card = cardOf(c)
    if (!card) continue
    const given = typeof c?.id === 'string' && c.id.trim() ? c.id : null
    const id = given && !out.some((o) => o.id === given) ? given : `c${i}`
    out.push({ id, ...card })
  }
  return out
}

/** The stored cards: `cards` from an archive with per-card settings, else the old `homeCards`. */
export const storedCards = (v: { homeCards?: unknown; cards?: unknown } | null): unknown => (v && 'cards' in v ? v.cards : v?.homeCards)

/** Whether the archive predates per-card settings (it sends no `cards`), so it takes only the old shape. */
export const legacyCards = (v: object): boolean => !('cards' in v)

/** The cards in the old shape, for an archive that only takes it: one of each, as it allows. */
export function toLegacyCards(cards: HomeCard[]): LegacyHomeCard[] {
  const out: LegacyHomeCard[] = []
  for (const c of cards) {
    const card: LegacyHomeCard = c.type === 'live' ? { kind: 'latest' } : c.type === 'games' ? { kind: 'games' } : { kind: c.count === 1 ? 'one' : 'tag', tag: c.tag }
    if (!out.some((o) => JSON.stringify(o) === JSON.stringify(card))) out.push(card)
  }
  return out
}

/** Takes the archive's options; on any failure (an archive without them answers 404) keeps what's there. */
export async function loadSiteOptions(fetcher: typeof fetch = (...a) => fetch(...a), apiBase = vodsConfig.apiBase): Promise<void> {
  try {
    const res = await fetcher(`${apiBase.replace(/\/+$/, '')}/v1/site/options`, { headers: { accept: 'application/json' } })
    if (!res.ok) return
    const body = (await res.json()) as Partial<Record<keyof SiteOptions | 'cards', unknown>> | null
    siteOptions.value = { homeCards: homeCardsOf(storedCards(body)), playDefault: body?.playDefault === 'compiled' ? 'compiled' : 'segments' }
  } catch {
    // keep the defaults
  }
}
