// Chapters that can't be watched: cut from the YouTube uploads (DMCA), or a merge's gap, where the stream was down
// between two Twitch VODs of one broadcast.
import type { Chapter, PartStatus, Vod } from '../../index'

/** What a merge's gap chapter is called until an admin sets a label (the archive's default). */
export const GAP_LABEL = 'Technical difficulties'

export const isGap = (c: Pick<Chapter, 'kind'>) => c.kind === 'gap'

/** The chip for an unwatchable chapter (label and tooltip), or null for a normal one. */
export function cutNote(c: Pick<Chapter, 'kind' | 'restricted'>): { label: string; title: string } | null {
  if (isGap(c)) return { label: 'stream down', title: 'The stream dropped here; both halves are joined in this VOD' }
  if (c.restricted) return { label: 'cut', title: 'Cut from the YouTube uploads' }
  return null
}

/** A part the player can't play: not on YouTube, not embeddable, or failing. */
export const unplayable = (s: PartStatus | undefined) => s === 'missing' || s === 'blocked' || s === 'error'

/** Nothing left to play: every chapter was cut (or is a merge's gap). The archive's `$cut=false` leaves these out. */
export const cutInFull = (vod: Pick<Vod, 'chapters'>) => vod.chapters.length > 0 && vod.chapters.every((c) => c.restricted)
