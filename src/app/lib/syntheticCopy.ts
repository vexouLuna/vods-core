// Pure rules for the synthetic VOD editor: the archive's id rule (twitch-archive compose.check_id) and a copy of one.
import type { SyntheticVod } from '../admin/api'
import { isAutoTag } from './vodTags'

/** What the archive accepts as a synthetic VOD id (the server answers 409 when it's taken). */
export const SYNTH_ID = /^[a-z0-9][a-z0-9+_-]{0,99}$/

/** Why `id` can't be a new synthetic VOD's id, or null. Mirrors the archive's check. */
export function idProblem(id: string): string | null {
  if (!id) return 'Give it an id.'
  if (/^\d+$/.test(id)) return "Not only digits: those are Twitch's VOD ids."
  if (id.length > 100) return 'At most 100 characters.'
  if (!SYNTH_ID.test(id)) return 'Lowercase letters, digits, - + and _ only, starting with a letter or digit.'
  return null
}

/** `<id>-copy`, then `<id>-copy-2`, `-3`…: the first `taken` doesn't claim. The id is lowercased and cut to fit. */
export function copyId(id: string, taken: (candidate: string) => boolean): string {
  const base = id.toLowerCase().replace(/[^a-z0-9+_-]/g, '-')
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '-copy' : `-copy-${n}`
    const candidate = base.slice(0, 100 - suffix.length) + suffix
    if (!taken(candidate)) return candidate
  }
}

/** A segment as the editor's rows hold it. */
export interface CopyRow { vod_id: string; start: number | null; end: number | null; at: number | null; label: string; gapLabel: string }

/**
 * What a copy starts from. Every segment keeps its `at` (a gap where the stream was down) and `gap_label`, whatever kind
 * the source is. Not carried: `supersedes` (it would hide the source's VODs again), `auto` (a second self-refreshing VOD)
 * and the tags the archive sets itself (`vods`, `compilation`, `new`, `updated`).
 */
export function copyOf(v: SyntheticVod): { title: string; tags: string[]; rows: CopyRow[] } {
  return {
    title: v.title ?? '',
    tags: v.tags.filter((t) => !isAutoTag(t)),
    rows: v.segments.map((s) => ({ vod_id: s.vod_id, start: s.start, end: s.end, at: s.at, label: s.label ?? '', gapLabel: s.gap_label ?? '' })),
  }
}
