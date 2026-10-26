// Editing a VOD's chapters and uploads: draft rows for the forms, the same checks the worker makes (so mistakes show
// next to the row before saving), and the request bodies. Pure functions; the pages hold the drafts.
import { boxArt, normalizeVod, toClock, toSeconds, type RawChapter, type RawDrive, type RawUpload } from '../../index'
import type { AdminVod, CensorCover, CensorRange, CensorRegion, ChapterEdit, GameRow, VodPatch, YoutubeEdit } from './api'
import { isAutoTag, vodTags } from '../lib/vodTags'

let nextKey = 1
const key = () => nextKey++

/** A chapter's game as the game picker edits it. */
export interface GameValue {
  name: string | null
  gameId: string | null
  imageTemplate: string | null
}

export interface ChapterDraft {
  key: number
  name: string | null
  gameId: string | null
  imageTemplate: string | null
  /** VOD seconds. */
  start: number
  /** VOD seconds (absolute), unlike the API's length. */
  end: number
  restricted: boolean
  /** A merge's gap chapter ("Technical difficulties"): kept as one on save. */
  kind?: 'gap'
}

/** A box art URL with the size baked in → a `{width}x{height}` template (older chapters only have `image`). */
export function templateOf(image: string | null | undefined): string | null {
  if (!image) return null
  if (image.includes('{width}x{height}')) return image
  const t = image.replace(/-\d+x\d+(\.\w+)(\?.*)?$/, '-{width}x{height}$1')
  return t === image ? null : t
}

export function chapterDrafts(chapters: readonly RawChapter[] | null | undefined): ChapterDraft[] {
  return (chapters ?? []).map((c) => {
    const length = c.length ?? c.end
    return {
      key: key(),
      name: c.name ?? null,
      gameId: c.gameId ?? null,
      imageTemplate: c.imageTemplate ?? templateOf(c.image),
      start: c.start,
      end: c.start + length,
      restricted: !!c.restricted,
      ...(c.kind === 'gap' ? { kind: 'gap' as const } : {}),
    }
  })
}

/** Where a new row goes: after the last one (or at 0), running to the end of the VOD. */
function nextSpan(rows: readonly { end: number }[], duration: number): { start: number; end: number } {
  const start = rows.reduce((m, r) => Math.max(m, r.end), 0)
  return { start, end: Math.max(start + 1, duration) }
}

/**
 * Problems per row (by key) in a list of time spans, matching the worker's checks: start ≥ 0, length > 0, inside the
 * VOD, and no overlap with the row before it once sorted (`noun` names that row). `check` runs first, for checks of
 * its own. Unsorted rows are fine here; they're sorted on save.
 */
function spanErrors<R extends { key: number; start: number; end: number }>(
  rows: readonly R[],
  duration: number,
  noun: string,
  check?: (r: R) => string | null,
): Map<number, string> {
  const errors = new Map<number, string>()
  let prev: R | null = null
  for (const r of [...rows].sort((a, b) => a.start - b.start)) {
    const own = check?.(r)
    if (own) errors.set(r.key, own)
    else if (!Number.isFinite(r.start) || r.start < 0) errors.set(r.key, 'Start must be a time ≥ 0:00.')
    else if (!Number.isFinite(r.end) || r.end <= r.start) errors.set(r.key, 'End must be after the start.')
    else if (duration > 0 && r.end > duration + 1) errors.set(r.key, `Ends after the VOD (${toClock(duration)}).`)
    else if (prev && r.start < prev.end - 0.001) errors.set(r.key, `Overlaps the ${noun} before it (ends ${toClock(prev.end)}).`)
    prev = r
  }
  return errors
}

/** A new chapter after the last one (or at 0), running to the end of the VOD. */
export function newChapter(rows: readonly ChapterDraft[], duration: number): ChapterDraft {
  return { key: key(), name: null, gameId: null, imageTemplate: null, ...nextSpan(rows, duration), restricted: false }
}

/** Problems per chapter (by key), as `spanErrors` checks them. */
export function chapterErrors(rows: readonly ChapterDraft[], duration: number): Map<number, string> {
  return spanErrors(rows, duration, 'chapter')
}

export function chapterEdits(rows: readonly ChapterDraft[]): ChapterEdit[] {
  return [...rows]
    .sort((a, b) => a.start - b.start)
    .map((r) => ({
      name: r.name,
      gameId: r.gameId,
      imageTemplate: r.imageTemplate,
      start: r.start,
      length: r.end - r.start,
      restricted: r.restricted,
      ...(r.kind === 'gap' ? { kind: 'gap' as const } : {}),
    }))
}

/** Stretches of the VOD no chapter covers (shown as a hint; gaps are allowed). */
export function chapterGaps(rows: readonly ChapterDraft[], duration: number): { start: number; end: number }[] {
  const gaps: { start: number; end: number }[] = []
  let at = 0
  for (const r of [...rows].sort((a, b) => a.start - b.start)) {
    if (r.start - at > 1) gaps.push({ start: at, end: r.start })
    at = Math.max(at, r.end)
  }
  if (duration - at > 1) gaps.push({ start: at, end: duration })
  return gaps
}

/** "1:02:03", "62:03", "3723" or "1h2m3s" → seconds; NaN when it can't be read. */
export function parseTime(value: string): number {
  const v = value.trim().toLowerCase()
  if (!v) return NaN
  if (/^\d+(\.\d+)?$/.test(v) || v.includes(':')) return toSeconds(v)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(v)
  if (!m || (!m[1] && !m[2] && !m[3])) return NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Seconds → "1:02:03" for the time inputs (keeps a fraction if there is one). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return ''
  const whole = Math.floor(seconds)
  const frac = seconds - whole
  const h = Math.floor(whole / 3600)
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, '0')
  const s = String(whole % 60).padStart(2, '0')
  return `${h}:${m}:${s}${frac > 0.0005 ? frac.toFixed(3).slice(1) : ''}`
}

// ---- uploads ----

export interface YoutubeDraft {
  key: number
  id: string
  type: RawUpload['type']
  part: number
  /** Seconds, or null to keep what the archive has (still processing). */
  duration: number | null
  thumbnail: string | null
}

export function youtubeDrafts(uploads: readonly RawUpload[] | null | undefined): YoutubeDraft[] {
  return (uploads ?? []).map((u, i) => ({
    key: key(),
    id: u.id,
    type: u.type,
    part: u.part ?? i + 1,
    duration: u.duration ?? null,
    thumbnail: u.thumbnail_url ?? null,
  }))
}

export function newYoutube(rows: readonly YoutubeDraft[], type: 'vod' | 'live' = 'vod'): YoutubeDraft {
  const part = rows.filter((r) => r.type === type).reduce((m, r) => Math.max(m, r.part), 0) + 1
  return { key: key(), id: '', type, part, duration: null, thumbnail: null }
}

/** A YouTube URL (watch, youtu.be, shorts, embed) or a bare id → the id. */
export function youtubeId(value: string): string {
  const v = value.trim()
  const m = /(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})/.exec(v)
  return m ? m[1]! : v
}

export function youtubeErrors(rows: readonly YoutubeDraft[]): Map<number, string> {
  const errors = new Map<number, string>()
  const ids = new Set<string>()
  const parts = new Set<string>()
  for (const r of rows) {
    const id = r.id.trim()
    const slot = `${r.type}:${r.part}`
    if (!id) errors.set(r.key, 'Video id is required.')
    else if (!Number.isInteger(r.part) || r.part < 1) errors.set(r.key, 'Part must be a whole number ≥ 1.')
    else if (ids.has(id)) errors.set(r.key, 'This video is listed twice.')
    else if (parts.has(slot)) errors.set(r.key, `There is already a ${r.type} part ${r.part}.`)
    else if (r.duration != null && (!Number.isFinite(r.duration) || r.duration < 0)) errors.set(r.key, 'Duration must be a time.')
    ids.add(id)
    parts.add(slot)
  }
  return errors
}

export function youtubeEdits(rows: readonly YoutubeDraft[]): YoutubeEdit[] {
  return [...rows]
    .sort((a, b) => (a.type === b.type ? a.part - b.part : a.type === 'vod' ? -1 : 1))
    .map((r) => ({ id: r.id.trim(), type: r.type, part: r.part, ...(r.duration != null ? { duration: r.duration } : {}) }))
}

export interface DriveDraft extends RawDrive {
  key: number
}

export const driveDrafts = (files: readonly RawDrive[] | null | undefined): DriveDraft[] =>
  (files ?? []).map((f) => ({ key: key(), id: f.id, type: f.type }))

export const newDrive = (): DriveDraft => ({ key: key(), id: '', type: 'vod' })

/** A Google Drive file URL or a bare id → the id. */
export function driveId(value: string): string {
  const v = value.trim()
  const m = /\/d\/([\w-]{10,})|[?&]id=([\w-]{10,})/.exec(v)
  return m ? (m[1] ?? m[2])! : v
}

export function driveErrors(rows: readonly DriveDraft[]): Map<number, string> {
  const errors = new Map<number, string>()
  const ids = new Set<string>()
  for (const r of rows) {
    const id = r.id.trim()
    if (!id) errors.set(r.key, 'File id is required.')
    else if (ids.has(id)) errors.set(r.key, 'This file is listed twice.')
    ids.add(id)
  }
  return errors
}

export const driveEdits = (rows: readonly DriveDraft[]): RawDrive[] => rows.map((r) => ({ id: r.id.trim(), type: r.type }))

// ---- censor ranges ----

export type CensorVideo = 'none' | CensorCover

export interface CensorDraft {
  key: number
  /** VOD seconds; null while the time can't be read. */
  start: number | null
  end: number | null
  video: CensorVideo
  /** The fill for `color`, `#rrggbb` (kept while another cover is picked, so switching back keeps it). */
  color: string
  /** Only this box is covered; null covers the whole frame. */
  region: CensorRegion | null
  mute: boolean
  note: string
}

export const CENSOR_NOTE_MAX = 200
/** A box's smallest width or height, as a fraction of the frame (the worker's REGION_MIN). */
export const REGION_MIN = 0.01
export const DEFAULT_COLOR = '#000000'
const HEX_COLOR = /^#[0-9a-f]{6}$/i

const round4 = (v: number) => Math.round(v * 10_000) / 10_000

/** A box rounded as the worker stores it (4 places) and kept inside the frame, at least REGION_MIN wide and high. */
export function fitRegion(r: CensorRegion): CensorRegion {
  const w = Math.min(1, Math.max(REGION_MIN, round4(r.w)))
  const h = Math.min(1, Math.max(REGION_MIN, round4(r.h)))
  return { x: Math.min(round4(1 - w), Math.max(0, round4(r.x))), y: Math.min(round4(1 - h), Math.max(0, round4(r.y))), w, h }
}

export const censorDrafts = (ranges: readonly CensorRange[] | null | undefined): CensorDraft[] =>
  (ranges ?? []).map((r) => ({
    key: key(),
    start: r.start,
    end: r.end,
    video: r.video ?? 'none',
    color: r.color ?? DEFAULT_COLOR,
    region: r.region ? { ...r.region } : null,
    mute: r.mute,
    note: r.note ?? '',
  }))

/** A new range: a minute after the last one (or from the start), blurred. `at` (the preview's playhead) starts it there. */
export function newCensor(rows: readonly CensorDraft[], duration: number, at?: number): CensorDraft {
  const after = at ?? rows.reduce((m, r) => Math.max(m, r.end ?? 0), 0)
  const start = duration > 0 ? Math.min(after, Math.max(0, duration - 60)) : after
  const end = duration > 0 ? Math.min(start + 60, duration) : start + 60
  return { key: key(), start, end, video: 'blur', color: DEFAULT_COLOR, region: null, mute: false, note: '' }
}

/** The same range again, its box moved a little so both show (two boxes at once are two ranges). */
export function duplicateCensor(r: CensorDraft): CensorDraft {
  const region = r.region ? fitRegion({ ...r.region, x: r.region.x + 0.05, y: r.region.y + 0.05 }) : null
  return { ...r, key: key(), region }
}

/** The worker's checks: a start and an end inside the VOD, and something to do (cover the picture or mute); a colour
 * for a fill, and a box inside the frame on a range that covers. Ranges may overlap: the strongest whole-frame cover
 * wins where they do (black, colour, pixelate, blur), and boxes stack. */
export function censorErrors(rows: readonly CensorDraft[], duration: number): Map<number, string> {
  const errors = new Map<number, string>()
  for (const r of rows) {
    if (r.start == null || r.end == null || !Number.isFinite(r.start) || !Number.isFinite(r.end)) errors.set(r.key, 'Start and end are required.')
    else if (r.start < 0) errors.set(r.key, 'Start must be 0 or later.')
    else if (r.end <= r.start) errors.set(r.key, 'End must be after the start.')
    else if (duration > 0 && r.end > duration + 1) errors.set(r.key, `Ends after the VOD (${toClock(duration)}).`)
    else if (r.video === 'none' && !r.mute) errors.set(r.key, 'Cover the picture, mute the sound, or both.')
    else if (r.video === 'color' && !HEX_COLOR.test(r.color)) errors.set(r.key, 'Pick a colour (#rrggbb).')
    else if (r.region && r.video === 'none') errors.set(r.key, 'A box needs a cover: blur, black, pixelate or a colour.')
    else if (r.region && regionError(r.region)) errors.set(r.key, regionError(r.region)!)
    else if (r.note.trim().length > CENSOR_NOTE_MAX) errors.set(r.key, `The note is longer than ${CENSOR_NOTE_MAX} characters.`)
  }
  return errors
}

function regionError(r: CensorRegion): string | null {
  const [x, y, w, h] = [r.x, r.y, r.w, r.h].map(round4) as [number, number, number, number]
  if (![x, y, w, h].every(Number.isFinite)) return 'The box is missing its size.'
  if (x < 0 || y < 0) return 'The box starts outside the frame.'
  if (w < REGION_MIN || h < REGION_MIN) return 'The box is too small.'
  if (x + w > 1 + 1e-9 || y + h > 1 + 1e-9) return 'The box reaches past the edge of the frame.'
  return null
}

export function censorEdits(rows: readonly CensorDraft[]): CensorRange[] {
  return [...rows]
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.end ?? 0) - (b.end ?? 0))
    .map((r) => ({
      start: r.start ?? 0,
      end: r.end ?? 0,
      video: r.video === 'none' ? null : r.video,
      ...(r.video === 'color' ? { color: r.color.toLowerCase() } : {}),
      ...(r.region && r.video !== 'none' ? { region: { x: round4(r.region.x), y: round4(r.region.y), w: round4(r.region.w), h: round4(r.region.h) } } : {}),
      mute: r.mute,
      ...(r.note.trim() ? { note: r.note.trim() } : {}),
    }))
}

/** How long the ranges hide, overlaps counted once (for "2:30 hidden"). */
export function censoredSeconds(ranges: readonly Pick<CensorRange, 'start' | 'end'>[]): number {
  let total = 0
  let at = -Infinity
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const from = Math.max(r.start, at)
    if (r.end > from) total += r.end - from
    at = Math.max(at, r.end)
  }
  return total
}

// ---- the header panel (title, tags, cut reason): the same on a regular and a synthetic VOD ----

export interface HeaderDraft {
  title: string
  /** The tags that can be taken off: the VOD's own, without the automatic ones (lockedTags). */
  tags: string[]
  /** Why the VOD was cut, or '' for none. */
  cutReason: string
}

/** The worker's limit on `cutReason`. */
export const CUT_REASON_MAX = 500

/** A chip the tags input shows first and can't take off: a state of the VOD, or a tag the site or archive sets. */
export interface LockedChip {
  value: string
  label?: string
  tone?: 'default' | 'accent' | 'warn'
  title: string
}

const AUTO_TITLES: Record<string, string> = {
  vods: 'Set by the archive on every VOD /vods lists',
  compilation: 'Set by the archive while it keeps itself up to date',
  new: 'Its first footage went live in the last week',
  updated: 'Got footage from the last week',
}

/** The VOD's states (hidden, synthetic, merged), then its automatic tags: shown first in the tags input, locked. */
export function lockedTags(vod: AdminVod, now = Date.now()): LockedChip[] {
  const out: LockedChip[] = []
  if (vod.hidden) out.push({ value: 'hidden', tone: 'warn', title: 'Set while the VOD is hidden: use the switch above' })
  if (vod.synthetic) {
    const merge = vod.synthetic.supersedes
    out.push({ value: merge ? 'merge or split' : 'synthetic', tone: 'accent', title: merge ? 'Stands in for the VODs it was made of' : 'Made of windows of other VODs' })
  }
  if (vod.merged_into) out.push({ value: 'merged', title: `Merged into ${vod.merged_into.id}` })
  for (const t of vodTags(normalizeVod(vod), now)) if (isAutoTag(t)) out.push({ value: t, title: AUTO_TITLES[t] ?? 'Set automatically' })
  return out
}

export function headerDraft(vod: AdminVod): HeaderDraft {
  return {
    title: vod.title ?? '',
    tags: (vod.tags ?? []).filter((t) => !isAutoTag(t)),
    cutReason: vod.cut_reason ?? '',
  }
}

export function headerErrors(d: HeaderDraft): Map<keyof HeaderDraft, string> {
  const errors = new Map<keyof HeaderDraft, string>()
  if (!d.title.trim()) errors.set('title', "The title can't be empty.")
  if (d.cutReason.trim().length > CUT_REASON_MAX) errors.set('cutReason', `At most ${CUT_REASON_MAX} characters.`)
  return errors
}

/** Only what changed. `tags` replaces the VOD's list, so the stored automatic ones (`vods`, `compilation`) go along. */
export function headerPatch(d: HeaderDraft, vod: AdminVod): VodPatch {
  const was = headerDraft(vod)
  const patch: VodPatch = {}
  if (d.title.trim() !== was.title) patch.title = d.title.trim()
  if ([...d.tags].sort().join() !== [...was.tags].sort().join())
    patch.tags = [...(vod.tags ?? []).filter(isAutoTag), ...d.tags]
  if (d.cutReason.trim() !== was.cutReason) patch.cutReason = d.cutReason.trim() || null
  return patch
}

// ---- details (thumbnail, duration, date; a synthetic VOD has only the thumbnail: the rest come from its segments) ----

export interface DetailsDraft {
  /** An http(s) URL, or '' for the default (the first YouTube part's, or a synthetic VOD's first source's). */
  thumbnailUrl: string
  /** Seconds. */
  duration: number
  /** The `datetime-local` value, in this browser's time zone. */
  createdAt: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** An ISO time → a `datetime-local` value in this browser's zone ("2026-09-30T20:00:05"). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** A `datetime-local` value (this browser's zone) → ISO with `Z`; null when it can't be read. */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(value)) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Seconds → the worker's `HH:MM:SS` (whole seconds, hours zero-padded and allowed past 99). */
export function hhmmss(seconds: number): string {
  const s = Math.round(seconds)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function vodSeconds(vod: Pick<AdminVod, 'duration' | 'duration_seconds'>): number {
  if (vod.duration_seconds != null) return vod.duration_seconds
  const s = toSeconds(vod.duration)
  return Number.isFinite(s) ? s : 0
}

export function detailsDraft(vod: AdminVod): DetailsDraft {
  return {
    thumbnailUrl: (vod.synthetic ? vod.synthetic.thumbnailUrl : vod.thumbnail_url) ?? '',
    duration: vodSeconds(vod),
    createdAt: toLocalInput(vod.createdAt),
  }
}

/**
 * Problems by field, matching the worker's checks. `contentEnd` is where the last chapter or games row ends: the
 * duration can't be shorter. `synthetic`: only the thumbnail is checked.
 */
export function detailsErrors(d: DetailsDraft, contentEnd = 0, synthetic = false): Map<keyof DetailsDraft, string> {
  const errors = new Map<keyof DetailsDraft, string>()
  const url = d.thumbnailUrl.trim()
  if (url && !/^https?:\/\/\S+$/i.test(url)) errors.set('thumbnailUrl', 'An http(s) URL, or empty for the default.')
  if (synthetic) return errors
  if (!Number.isFinite(d.duration) || d.duration <= 0) errors.set('duration', 'The duration must be a time.')
  else if (contentEnd > d.duration + 1) errors.set('duration', `Chapters or games run to ${toClock(contentEnd)}: shorten them first.`)
  if (!fromLocalInput(d.createdAt)) errors.set('createdAt', 'Pick a date and time.')
  return errors
}

/** Only the fields that changed, as PATCH /api/v2/vods/:id takes them (a synthetic VOD: only the thumbnail). */
export function detailsPatch(d: DetailsDraft, vod: AdminVod): VodPatch {
  const was = detailsDraft(vod)
  const patch: VodPatch = {}
  if (d.thumbnailUrl.trim() !== was.thumbnailUrl) patch.thumbnailUrl = d.thumbnailUrl.trim() || null
  if (vod.synthetic) return patch
  if (Math.round(d.duration) !== Math.round(was.duration)) patch.duration = hhmmss(d.duration)
  if (d.createdAt !== was.createdAt) {
    const at = fromLocalInput(d.createdAt)
    if (at) patch.createdAt = at
  }
  return patch
}

// ---- games rows ----

export interface GameDraft extends GameValue {
  key: number
  start: number
  end: number
  /** The row's other fields (upload id, title, thumbnail…), sent back unchanged. */
  rest: Omit<GameRow, 'start_time' | 'end_time' | 'game_id' | 'game_name' | 'chapter_image'>
  /** The saved box art, kept when the game didn't change. */
  image: string | null
}

export function gameDrafts(rows: readonly GameRow[] | null | undefined): GameDraft[] {
  return (rows ?? []).map(({ start_time, end_time, game_id, game_name, chapter_image, ...rest }) => ({
    key: key(),
    name: game_name || null,
    gameId: game_id ?? null,
    imageTemplate: templateOf(chapter_image),
    image: chapter_image ?? null,
    start: Number(start_time),
    end: Number(end_time),
    rest,
  }))
}

/** Games rows from the VOD's chapters (cut ones and gaps left out), as a starting point. */
export function gamesFromChapters(chapters: readonly RawChapter[] | null | undefined): GameDraft[] {
  return chapterDrafts(chapters)
    .filter((c) => !c.restricted && c.kind !== 'gap' && c.name)
    .sort((a, b) => a.start - b.start)
    .map((c) => ({ key: key(), name: c.name, gameId: c.gameId, imageTemplate: c.imageTemplate, image: null, start: c.start, end: c.end, rest: {} }))
}

export function newGame(rows: readonly GameDraft[], duration: number): GameDraft {
  return { key: key(), name: null, gameId: null, imageTemplate: null, image: null, ...nextSpan(rows, duration), rest: {} }
}

/** Problems per row (by key), as the worker checks them: a game, then as `spanErrors`. */
export function gameErrors(rows: readonly GameDraft[], duration: number): Map<number, string> {
  return spanErrors(rows, duration, 'row', (r) => (r.name?.trim() ? null : 'Pick a game.'))
}

/** The PUT body's rows, sorted by start (the worker refuses them unsorted). */
export function gameEdits(rows: readonly GameDraft[]): GameRow[] {
  return [...rows]
    .sort((a, b) => a.start - b.start)
    .map((r) => {
      const same = r.image && templateOf(r.image) === r.imageTemplate
      return {
        ...r.rest,
        start_time: r.start,
        end_time: r.end,
        game_id: r.gameId,
        game_name: (r.name ?? '').trim(),
        chapter_image: same ? r.image : boxArt(r.imageTemplate, 40),
      }
    })
}
