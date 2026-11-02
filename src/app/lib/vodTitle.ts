// What a VOD card or the home page headlines a VOD with: the stream's title, or one made from its date and games (like
// the YouTube uploads' titles, which are made from the date), for a channel that keeps one title for every stream. The
// site picks the default (`site.vodTitle`); the viewer can pick for themselves, remembered in this browser.
import { ref } from 'vue'
import { NO_CATEGORY, type Vod } from '../../index'
import { site } from '../site'
import { tabOf } from './listQuery'

export type TitleMode = 'original' | 'generated'

const KEY = 'vods.titles.v1'

function saved(): TitleMode | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'original' || v === 'generated' ? v : null
  } catch {
    return null
  }
}

/** The viewer's pick, or null for the site's default. */
const picked = ref<TitleMode | null>(saved())

/** The mode in use: the viewer's pick, else the site's. */
export const titleMode = (): TitleMode => picked.value ?? site.vodTitle

export function setTitleMode(mode: TitleMode): void {
  picked.value = mode === site.vodTitle ? null : mode
  try {
    if (picked.value) localStorage.setItem(KEY, picked.value)
    else localStorage.removeItem(KEY)
  } catch {
    // not saved; still works for this visit
  }
}

/** The VOD's games, in the order first played, without a merge's gaps or uncategorised chapters. */
export const vodGames = (vod: Pick<Vod, 'chapters'>): string[] => [
  ...new Set(vod.chapters.filter((c) => c.kind !== 'gap' && c.name !== NO_CATEGORY).map((c) => c.name)),
]

/** "Tue, Oct 28, 2026 · Alien: Isolation + League of Legends", or "… · A, B + 2 more" past two games. */
export function generatedTitle(vod: Pick<Vod, 'chapters' | 'createdAt'>, locale?: string): string {
  const date = vod.createdAt.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const games = vodGames(vod)
  if (!games.length) return date
  const shown = games.length > 3 ? `${games.slice(0, 2).join(', ')} + ${games.length - 2} more` : games.join(' + ')
  return `${date} · ${shown}`
}

/** Whether `vod` is headlined with a made title: a plain VOD (not one with its own page) in the generated mode. */
export const titleIsGenerated = (vod: Vod, mode: TitleMode = titleMode()): boolean => mode === 'generated' && tabOf(vod) === 'vods'

/** The headline for `vod`: its date and games when titleIsGenerated, else its own title. */
export function vodTitle(vod: Vod, mode: TitleMode = titleMode()): string {
  return titleIsGenerated(vod, mode) ? generatedTitle(vod) : vod.title || 'Untitled stream'
}
