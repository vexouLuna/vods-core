// What the worker makes of the censor drafts, for the preview to show and play the same: each box and its text in the
// frame's pixels (twitch-archive's ffmpeg._box, text_filter and cover_filter), and what the
// sound is at a moment (ffmpeg.sound_args). tests/app/censorRender.test.ts pins these to the worker's own numbers.
import type { CensorRegion } from '../api'
import type { CensorDraft } from '../edits'
import type { FontMetrics } from './fontMetrics'

// The worker applies the ranges in the list's own order, each over the ones before; nothing here sorts them.

/** The text the worker writes: trimmed, whitespace runs as one space (what censorEdits saves). */
export const censorText = (text: string): string => text.trim().replace(/\s+/g, ' ')

export interface PxBox {
  x: number
  y: number
  w: number
  h: number
}

/** Half up to an even number (Python's floor(v / 2 + 0.5) * 2: yuv420's chroma is half size). */
const even = (v: number) => Math.floor(v / 2 + 0.5) * 2

/** ffmpeg._box: a region (fractions; null is the whole frame) in pixels of a `width` x `height` frame, on even
 * numbers, at least 4 px, inside the frame. */
export function boxPx(region: CensorRegion | null, width: number, height: number): PxBox {
  const { x, y, w, h } = region ?? { x: 0, y: 0, w: 1, h: 1 }
  const pw = Math.min(Math.max(even(w * width), 4), width - (width % 2))
  const ph = Math.min(Math.max(even(h * height), 4), height - (height % 2))
  const px = Math.min(even(x * width), width - pw)
  const py = Math.min(even(y * height), height - ph)
  return { x: Math.max(px, 0), y: Math.max(py, 0), w: pw, h: ph }
}

/** ffmpeg.text_size: the font size (px) for one line of `text` in `box` (half the box's height at most; the line,
 * measured in the worker's font with its outline, at most 90% of the box's width; 10 at least), and the outline's
 * width (ffmpeg.text_filter). The same integer maths as the worker. Until the font has loaded (`font` null), a rough
 * guess of 0.625 em a character. */
export function textSize(box: PxBox, text: string, font: FontMetrics | null): { size: number; border: number } {
  const line = censorText(text)
  const units = font?.units ?? 2048
  const width = font ? font.advance(line) : Math.round([...line].length * 0.625 * units)
  const fits = Math.floor((54 * box.w * units) / (10 * (6 * width + units))) // 0.9 * w / (width / units + 1 / 6)
  const size = Math.max(10, Math.min(Math.floor(box.h / 2), fits))
  return { size, border: Math.max(1, Math.floor(size / 12)) }
}

/** ffmpeg.cover_filter's blur radius (px; three box-blur passes, so about the standard deviation of a Gaussian): the
 * frame's short side / 20 for a lone whole-frame blur without text (COVER_FILTERS), else the box's short side / 8. */
export function blurRadius(box: PxBox, alone: boolean): number {
  return alone ? Math.floor(Math.min(box.w, box.h) / 20) : Math.max(1, Math.floor(Math.min(box.w, box.h) / 8))
}

/** ffmpeg.cover_filter's pixel block (px): about eight blocks across the box's short side, 4 px at least. */
export const pixelBlock = (box: PxBox): number => Math.max(4, Math.floor(Math.min(box.w, box.h) / 8))

/** cover_filter's shortcut: one whole-frame blur or black alone, without text, uses COVER_FILTERS. */
export const aloneCover = (covers: readonly Pick<CensorDraft, 'region' | 'text' | 'video'>[]): boolean =>
  covers.length === 1 && !covers[0]!.region && !censorText(covers[0]!.text) && (covers[0]!.video === 'blur' || covers[0]!.video === 'black')

/** A range is on at `t` (start inclusive, end exclusive). */
export const isOn = (r: Pick<CensorDraft, 'start' | 'end'>, t: number): boolean => r.start != null && r.end != null && r.start <= t && t < r.end

/** What the audio is at a moment, the ranges over it applied in the list's order, each over what the ones before made:
 * silence or a song replaces everything before it (a song silences the stream, then plays), a muffle low-passes what
 * there is. `song` plays from its range's `start`, looped, at `volume` (0 to 1). */
export interface SoundNow {
  base: 'stream' | 'silence' | 'song'
  song?: { id: string; volume: number; start: number }
  /** How many muffles go over the base, in turn. */
  muffles: number
}

export function soundAt(rows: readonly CensorDraft[], t: number): SoundNow {
  let now: SoundNow = { base: 'stream', muffles: 0 }
  for (const r of rows) {
    if (r.sound === 'none' || !isOn(r, t)) continue
    if (r.sound === 'muffle') now = { ...now, muffles: now.muffles + 1 }
    else if (r.sound === 'song' && r.song) now = { base: 'song', song: { id: r.song, volume: Math.round(r.volume) / 100, start: r.start! }, muffles: 0 }
    else now = { base: 'silence', muffles: 0 }
  }
  return now
}
