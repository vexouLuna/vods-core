// A VOD's tracks (Unmuted: its live recording; Muted: Twitch's VOD, each its own set of YouTube uploads) and what the
// watch page does when the part playing can't play: count down to the same moment on another track that has it, or,
// when no track does, count down twice as long to the next part. A track that couldn't play a stretch is remembered for
// this page load, so the countdown never sends you back to it. The viewer's own pick (Unmuted unless they chose Muted)
// is remembered in this browser; a fallback lasts one part, the next goes back to the pick.
import { ref } from 'vue'
import type { PlayableTimeline, Span, UploadType } from '../../index'

export interface Track {
  type: UploadType
  label: string
  /** This page on that track at VOD time t. */
  to: (t: number) => string
  /** That track has an upload for VOD time t (one of its own, not one it falls back to, and not still processing). */
  has: (t: number) => boolean
}

/** Whether `timeline` (built for `type`) has one of its own uploads at VOD time `t`. */
export function timelineHas(timeline: PlayableTimeline, type: UploadType, t: number): boolean {
  const i = timeline.partSpans().findIndex((s) => s.start <= t && t < s.end)
  const u = timeline.uploads[i]
  return !!u && u.type === type && u.duration !== null
}

/** What each track is called. */
export const trackLabel = (type: UploadType) => (type === 'live' ? 'Unmuted' : 'Muted')

const KEY = 'vods.track.v1'

function saved(): UploadType {
  try {
    return localStorage.getItem(KEY) === 'vod' ? 'vod' : 'live'
  } catch {
    return 'live'
  }
}

/** The track the viewer picked by hand, else Unmuted. */
export const preferredTrack = ref<UploadType>(saved())

/** The viewer picked `type` (only a pick by hand, never a fallback). */
export function setPreferredTrack(type: UploadType) {
  preferredTrack.value = type
  try {
    if (type === 'live') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, type)
  } catch {
    // not saved; still works for this visit
  }
}

const failed: { vodId: string; type: UploadType; span: Span }[] = []

/** Part `span` of `vodId` didn't play on `type`. */
export function markFailed(vodId: string, type: UploadType, span: Span) {
  if (!failed.some((f) => f.vodId === vodId && f.type === type && f.span.start === span.start && f.span.end === span.end)) failed.push({ vodId, type, span })
}

const failedAt = (vodId: string, type: UploadType, t: number) =>
  failed.some((f) => f.vodId === vodId && f.type === type && f.span.start <= t && t < f.span.end)

/** Forget every failure (tests). */
export function clearFailed() {
  failed.length = 0
}

export type TrackStep = { kind: 'switch'; track: Track; seconds: number } | { kind: 'next'; part: number; seconds: number }

/**
 * What to count down to when the part playing on `current` can't play at VOD time `t`: another track that has it and
 * hasn't failed there, after `base` seconds; else part `nextPart` after twice that; else nothing (-1: no part left).
 */
export function trackStep(vodId: string, tracks: readonly Track[], current: UploadType, t: number, nextPart: number, base: number): TrackStep | null {
  const track = tracks.find((k) => k.type !== current && k.has(t) && !failedAt(vodId, k.type, t))
  if (track) return { kind: 'switch', track, seconds: base }
  return nextPart >= 0 ? { kind: 'next', part: nextPart, seconds: base * 2 } : null
}

/** The viewer's track, when the part at VOD time `t` isn't playing on it but could (it has it, and it hasn't failed there). */
export function backToPreferred(vodId: string, tracks: readonly Track[], current: UploadType, t: number): Track | null {
  const want = preferredTrack.value
  if (want === current) return null
  const track = tracks.find((k) => k.type === want)
  return track && track.has(t) && !failedAt(vodId, want, t) ? track : null
}
