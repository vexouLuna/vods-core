// The watch page's timeline bar without its look: one bar for the whole VOD (all parts), where each chapter, chapter
// boundary, cut, part tick, stream break and mark goes on it, which marks fit, and seeking by pointer and keyboard (VOD
// seconds).
// WatchTimeline.vue draws it; a site with its own UI binds the same refs.
import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { previewFrame, type PartStatus, type PlayableTimeline, type Span } from '../../index'
import { unplayable } from '../lib/cuts'
import { clamp, clampX } from '../lib/place'
import { vodsConfig } from '../site'

/** The playhead's mood: crawling while the VOD plays, asleep while paused, floating while the time is being moved. */
export type SnailMode = 'walk' | 'sleep' | 'float'

export interface TimelineProps {
  timeline: PlayableTimeline
  /** The stretch of VOD time the bar covers. */
  range: Span
  /**
   * The playhead, in VOD seconds. A getter keeps the per-tick read inside the bar, so the page holding it doesn't
   * re-render on every tick.
   */
  time: number | (() => number)
  status: readonly PartStatus[]
  /** The labels above the bar: each chapter (a game) or each stream of a playthrough. Parts get none, only a tick. */
  marks?: readonly TimelineMark[]
  /**
   * Where a playthrough moves on to its next stream. Each gets a small break: it takes room on the bar but no time
   * (unlike a "stream down" gap inside a stream, which is time the stream was down).
   */
  breaks?: readonly number[]
  /** Where a stream jumps within its VOD (`skipped`: source seconds left out; below 0, it goes back). */
  jumps?: readonly { at: number; skipped: number }[]
  /** Colours per game, shared with the posters. */
  palette: ReadonlyMap<string, string>
  /** Whether the VOD is playing (the playhead walks), and at what speed. */
  playing?: boolean
  rate?: number
}

export interface TimelineMark {
  /** VOD seconds where it starts. */
  t: number
  label: string
  /** Box art shown before the label; alone when the label doesn't fit. */
  image?: string | null
  title?: string
  /** Can't be played here (a chapter cut from the uploads). */
  bad?: boolean
}

export interface TimelineHover {
  /** Pointer position on the bar, px. */
  x: number
  t: number
  /** Over a stream break. */
  brk: boolean
  jump?: { at: number; skipped: number }
}

/** Width of a stream break, in px: a fixed size reads the same on a 2 h playthrough as on a 40 h one. */
export const TIMELINE_BREAK = 10
/** Width of a mark shown as its box art alone, and what the art adds to a full one, in px (WatchTimeline's CSS). */
export const MARK_ICON = 26
export const MARK_ART = 20

/**
 * The bar's logic. Bind `root` to the bar's box, `track` to the slider, `tip` to the hover tip and the text of each mark to
 * `labelEls[i]`; `seek` gets the VOD time to go to.
 */
export function useTimeline(props: TimelineProps, options: { seek: (t: number) => void }) {
  const BREAK = TIMELINE_BREAK
  const time = computed(() => toValue(props.time as MaybeRefOrGetter<number>))
  const len = computed(() => Math.max(1, props.range.end - props.range.start))
  const brks = computed(() => [...(props.breaks ?? [])].filter((b) => b > props.range.start && b < props.range.end).sort((a, b) => a - b))
  // A time's place on the bar: its share of the time (`f`), of the room left after the breaks, plus the breaks before
  // it (`k`). A time right on a break is after it; a chapter ending there ends before it (`end`).
  function at(t: number, end = false) {
    const f = clamp(t - props.range.start, 0, len.value) / len.value
    let k = 0
    for (const b of brks.value) {
      if (end ? b >= t : b > t) break
      k++
    }
    return { f, k }
  }
  const css = (f: number, k: number) => {
    const px = k * BREAK - f * brks.value.length * BREAK
    return px ? `calc(${f * 100}% ${px < 0 ? '-' : '+'} ${Math.abs(px)}px)` : `${f * 100}%`
  }
  /** Where time `t` sits on the bar, as a CSS length. */
  const pct = (t: number) => {
    const p = at(t)
    return css(p.f, p.k)
  }
  /** The width of [a, b] on the bar, as a CSS length. */
  const width = (a: number, b: number) => {
    const p = at(Math.max(a, props.range.start))
    const q = at(Math.min(b, props.range.end), true)
    return css(Math.max(0, q.f - p.f), Math.max(0, q.k - p.k))
  }
  /** Each break, placed just before its stream starts. */
  const breakSpans = computed(() => brks.value.map((b, i) => ({ t: b, left: css(at(b).f, i) })))

  const chapters = computed(() => props.timeline.chapters.filter((c) => c.end > props.range.start && c.start < props.range.end))
  const spans = computed(() => props.timeline.partSpans())
  const marks = computed(() => (props.marks ?? []).filter((m) => m.t < props.range.end))
  const near = (t: number, list: readonly number[]) => list.some((x) => Math.abs(x - t) < 0.5)
  const jumpList = computed(() => (props.jumps ?? []).filter((j) => j.at > props.range.start && j.at < props.range.end))
  /** Part ticks, but not where a break or a jump already marks the spot. */
  const ticks = computed(() => {
    const jumpAt = jumpList.value.map((j) => j.at)
    return spans.value.slice(1).filter((s) => !near(s.start, brks.value) && !near(s.start, jumpAt))
  })
  // The bar's fixed marks, placed once per timeline rather than on every tick of the playhead.
  const chapterBars = computed(() =>
    chapters.value.map((c) => ({ c, style: { left: pct(c.start), width: width(c.start, c.end), '--c': props.palette.get(c.name) } })),
  )
  const unplayableBars = computed(() =>
    spans.value.flatMap((s, i) => (unplayable(props.status[i]) ? [{ left: pct(s.start), width: width(s.start, s.end) }] : [])),
  )
  /** Time the uploads skip (a live recording's ad breaks): watchable on Twitch, not here. */
  const missingBars = computed(() =>
    props.timeline.missing
      .filter((s) => s.end > props.range.start && s.start < props.range.end)
      .map((s) => ({ left: pct(s.start), width: width(s.start, s.end) })),
  )
  const tickLefts = computed(() => ticks.value.map((s) => pct(s.start)))
  /** Where one chapter gives way to the next, but not where a break already marks the spot. */
  const boundLefts = computed(() =>
    chapters.value
      .slice(1)
      .filter((c) => c.start > props.range.start && !near(c.start, brks.value))
      .map((c) => pct(c.start)),
  )
  const jumpBars = computed(() => jumpList.value.map((j) => ({ at: j.at, left: pct(j.at) })))

  // Marks can't all fit when chapters are short or the bar is narrow. They're placed in px, the one playing first; a
  // mark that would run into one already placed shows its box art alone, or if even that doesn't fit, is hidden (its
  // boundary stays on the bar; the chapters menu still lists it). One running off the right end slides back in.
  const root = ref<HTMLElement | null>(null)
  const track = ref<HTMLElement | null>(null)
  const tip = ref<HTMLElement | null>(null)
  const trackWidth = ref(0)
  /** Each mark's text, to measure. */
  const labelEls: (HTMLElement | null)[] = []
  const labelWidths = ref<number[]>([])
  watch(
    track,
    (el, _, onCleanup) => {
      if (!el || typeof ResizeObserver === 'undefined') return
      const resize = new ResizeObserver(() => (trackWidth.value = el.clientWidth))
      resize.observe(el)
      onCleanup(() => resize.disconnect())
    },
    { immediate: true },
  )
  watch(
    () => marks.value.map((m) => m.label).join('|'),
    () => (labelWidths.value = marks.value.map((_, i) => labelEls[i]?.offsetWidth ?? 0)),
    { flush: 'post', immediate: true },
  )
  /** Where time `t` sits on the bar, in px. */
  function px(t: number) {
    const p = at(t)
    return p.f * Math.max(1, trackWidth.value - brks.value.length * BREAK) + p.k * BREAK
  }
  /** The mark the playhead is in. */
  const curMark = computed(() => marks.value.findLastIndex((m) => m.t <= time.value + 0.5))
  /** Each mark that fits: where it goes (px) and whether it shows in full or as its art alone. */
  const placedMarks = computed(() => {
    const out = new Map<number, { x: number; icon: boolean }>()
    const room = trackWidth.value
    if (!room) return out
    const cur = curMark.value
    const order = marks.value.map((_, i) => i).sort((a, b) => Number(b === cur) - Number(a === cur))
    const placed: [number, number][] = []
    const free = (x: number, w: number) => !placed.some(([a, b]) => x < b + 3 && x + w > a - 3)
    for (const i of order) {
      const m = marks.value[i]!
      const at = Math.max(0, px(m.t))
      const full = (labelWidths.value[i] || m.label.length * 6.5) + 10 + (m.image ? MARK_ART : 0)
      for (const [w, icon] of m.image ? ([[full, false], [MARK_ICON, true]] as const) : ([[full, false]] as const)) {
        const x = Math.max(0, Math.min(at, room - w))
        if (!free(x, w)) continue
        placed.push([x, x + w])
        out.set(i, { x, icon })
        break
      }
    }
    return out
  })

  const hover = ref<TimelineHover | null>(null)
  const dragging = ref(false)

  // The snail floats while the time is being moved, and a moment after (so a click or a key shows it too).
  const floating = ref(false)
  let settle: ReturnType<typeof setTimeout> | undefined
  function float() {
    floating.value = true
    clearTimeout(settle)
    settle = setTimeout(() => (floating.value = false), 500)
  }
  function seekTo(t: number) {
    float()
    options.seek(t)
  }
  onScopeDispose(() => clearTimeout(settle))

  // A jump in the reported time that playing can't explain is a seek made somewhere else (YouTube's own progress bar,
  // the part picker): the snail floats for those too.
  let last = { t: time.value, at: performance.now() }
  watch(time, (t) => {
    const now = performance.now()
    const played = props.playing ? ((now - last.at) / 1000) * (props.rate ?? 1) : 0
    if (Math.abs(t - last.t - played) > 2) float()
    last = { t, at: now }
  })

  /** The time under a point of the bar; on a break, the start of the stream after it. */
  function pointAt(clientX: number): { t: number; brk: boolean } {
    const r = track.value!.getBoundingClientRect()
    const x = clientX - r.left
    const room = Math.max(1, r.width - brks.value.length * BREAK)
    let k = 0
    for (const b of brks.value) {
      const bx = ((b - props.range.start) / len.value) * room + k * BREAK
      if (x < bx) break
      if (x < bx + BREAK) return { t: b, brk: true }
      k++
    }
    return { t: props.range.start + clamp((x - k * BREAK) / room, 0, 1) * len.value, brk: false }
  }
  function onDown(e: PointerEvent) {
    if (e.button !== 0) return
    dragging.value = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onMove(e)
  }
  function onMove(e: PointerEvent) {
    const r = track.value!.getBoundingClientRect()
    const x = e.clientX - r.left
    const jump = jumpList.value.find((j) => Math.abs(px(j.at) - x) <= 4)
    hover.value = { x, ...pointAt(e.clientX), jump }
  }
  function onUp(e: PointerEvent) {
    if (!dragging.value) return
    dragging.value = false
    seekTo(props.timeline.watchable(pointAt(e.clientX).t))
  }
  function onLeave() {
    if (!dragging.value) hover.value = null
  }
  function onKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 60 : 10
    const map: Record<string, number> = { ArrowLeft: -step, ArrowRight: step, PageDown: -300, PageUp: 300 }
    if (e.key in map) {
      e.preventDefault()
      e.stopPropagation()
      seekTo(props.timeline.watchable(clamp(time.value + map[e.key]!, props.range.start, props.range.end)))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      seekTo(props.timeline.watchable(e.key === 'Home' ? props.range.start : props.range.end - 1))
    }
  }
  // The time tip is centred on the pointer; near the ends of the bar it slides sideways to stay over the timeline
  // (not off screen, and not over the chat beside it).
  const tipShift = ref(0)
  watch(
    hover,
    () => {
      const box = tip.value?.getBoundingClientRect()
      const area = root.value?.getBoundingClientRect()
      tipShift.value =
        box && area ? clampX(box.left - tipShift.value - area.left, box.right - tipShift.value - area.left, area.width, 4) : 0
    },
    { flush: 'post' },
  )
  const hoverChapter = computed(() => (hover.value ? props.timeline.chapterAt(hover.value.t) : null))
  const hoverCut = computed(() => (hover.value ? props.timeline.cutAt(hover.value.t) : null))
  const hoverMissing = computed(() => (hover.value ? props.timeline.missingAt(hover.value.t) : null))
  // The frame under the pointer, from the archive's preview sheets of the upload there; none over a break, a jump,
  // a gap, a cut, missing time or a part that can't play.
  const hoverPreview = computed(() => {
    const h = hover.value
    if (!h || h.brk || h.jump || hoverChapter.value?.kind === 'gap' || hoverCut.value || hoverMissing.value) return null
    const pos = props.timeline.locate(h.t)
    const upload = props.timeline.uploads[pos.index]
    if (!upload || unplayable(props.status[pos.index])) return null
    return previewFrame(upload, pos.offset, vodsConfig.apiBase)
  })
  /** The time the playhead shows: the pointer's while dragging. */
  const shown = computed(() => (dragging.value && hover.value ? hover.value.t : time.value))
  const snailMode = computed<SnailMode>(() => (dragging.value || floating.value ? 'float' : props.playing ? 'walk' : 'sleep'))
  /** The colour of the game at the playhead, for the snail's shell (none in a "stream down" gap). */
  const shownColor = computed(() => {
    const c = props.timeline.chapterAt(shown.value)
    return c && c.kind !== 'gap' ? props.palette.get(c.name) : undefined
  })

  return {
    BREAK,
    time,
    root,
    track,
    trackWidth,
    tip,
    labelEls,
    pct,
    width,
    px,
    pointAt,
    spans,
    marks,
    curMark,
    placedMarks,
    breakSpans,
    chapterBars,
    unplayableBars,
    missingBars,
    tickLefts,
    boundLefts,
    jumpBars,
    hover,
    dragging,
    tipShift,
    hoverChapter,
    hoverCut,
    hoverMissing,
    hoverPreview,
    shown,
    snailMode,
    shownColor,
    seekTo,
    onDown,
    onMove,
    onUp,
    onLeave,
    onKey,
  }
}
