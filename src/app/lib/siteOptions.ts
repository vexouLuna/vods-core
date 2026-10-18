// The site's own options from the archive (GET /v1/site/options; edited on /manage/home): which cards the homepage
// shows, in order, and which version of a compiled synthetic VOD plays first. Until the archive answers (or an archive without them), the defaults.
import { shallowRef } from 'vue'
import { vodsConfig } from '../site'
import type { TagStyle } from '../site'
import { TAG_NAME } from './tagRules'

/** One homepage card: the newest VOD (the stream while live), the newest VODs with a tag, or the most played games. */
export type HomeCard = { kind: 'latest' } | { kind: 'tag'; tag: string } | { kind: 'games' }

/** A synthetic VOD with a compiled upload plays its segments (each source's own uploads) or that one file. */
export type PlayDefault = 'segments' | 'compiled'

export interface SiteOptions {
  homeCards: HomeCard[]
  playDefault: PlayDefault
}

export const DEFAULT_SITE_OPTIONS: SiteOptions = {
  homeCards: [{ kind: 'latest' }, { kind: 'tag', tag: 'compilation' }, { kind: 'games' }],
  playDefault: 'segments',
}

export const siteOptions = shallowRef<SiteOptions>(DEFAULT_SITE_OPTIONS)

/** What tells two cards apart: a page shows each once. */
export const homeCardKey = (c: HomeCard): string => (c.kind === 'tag' ? `tag:${c.tag}` : c.kind)

/** A card's name on /manage/home: "Latest VOD", "Most played games", or "Latest " and the tag's page or label. */
export function homeCardLabel(c: HomeCard, tags: Record<string, TagStyle>): string {
  if (c.kind === 'latest') return 'Latest VOD'
  if (c.kind === 'games') return 'Most played games'
  const s = tags[c.tag]
  return `Latest ${s?.pageLabel ?? s?.label ?? c.tag}`
}

/** The cards the site can draw, in order, one of each; anything else is dropped. */
export function homeCardsOf(raw: unknown): HomeCard[] {
  if (!Array.isArray(raw)) return DEFAULT_SITE_OPTIONS.homeCards
  const out: HomeCard[] = []
  for (const c of raw as Array<Record<string, unknown> | null>) {
    const card: HomeCard | null =
      c?.kind === 'latest' || c?.kind === 'games'
        ? { kind: c.kind }
        : c?.kind === 'tag' && typeof c.tag === 'string' && TAG_NAME.test(c.tag)
          ? { kind: 'tag', tag: c.tag }
          : null
    if (card && !out.some((o) => homeCardKey(o) === homeCardKey(card))) out.push(card)
  }
  return out
}

/** Takes the archive's options; on any failure (an archive without them answers 404) keeps what's there. */
export async function loadSiteOptions(fetcher: typeof fetch = (...a) => fetch(...a), apiBase = vodsConfig.apiBase): Promise<void> {
  try {
    const res = await fetcher(`${apiBase.replace(/\/+$/, '')}/v1/site/options`, { headers: { accept: 'application/json' } })
    if (!res.ok) return
    const body = (await res.json()) as Partial<Record<keyof SiteOptions, unknown>>
    siteOptions.value = { homeCards: homeCardsOf(body?.homeCards), playDefault: body?.playDefault === 'compiled' ? 'compiled' : 'segments' }
  } catch {
    // keep the defaults
  }
}
