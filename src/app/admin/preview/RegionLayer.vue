<script setup lang="ts">
// Over the preview's video: the censor ranges playing now, drawn as the worker will (censorRender: its order, its
// boxes, text sizes and blur radius in the frame's pixels, scaled to the screen; a later range over an earlier one),
// and the selected range's box to draw, move and resize, outlined on top. Sits on the video's content box (the picture
// inside its letterbox), so a box's fractions are the frame's, as the worker reads them. What CSS can't match: the
// pixelation (a blur under a grid of the worker's block size) and the font (DejaVu Sans Bold where installed).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CensorRegion } from '../api'
import { fitRegion, REGION_MIN, type CensorDraft } from '../edits'
import { aloneCover, blurRadius, boxPx, censorOrder, censorText, isOn, pixelBlock, textSize } from './censorRender'

const props = defineProps<{
  /** The picture's width / height. */
  aspect: number
  /** The picture's size in pixels, which the worker sizes boxes and text in. */
  frame: { w: number; h: number }
  rows: CensorDraft[]
  time: number
  selected: number | null
  /** Draw the ranges playing now (off for a file that already has them burned in). */
  showActive: boolean
}>()

const frame = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([e]) => e && (size.value = { w: e.contentRect.width, h: e.contentRect.height }))
  if (frame.value) observer.observe(frame.value)
})
onBeforeUnmount(() => observer?.disconnect())

/** The content box inside the letterbox, in px. */
const box = computed(() => {
  const { w, h } = size.value
  const cw = Math.min(w, h * props.aspect)
  const ch = props.aspect > 0 ? cw / props.aspect : h
  return { left: (w - cw) / 2, top: (h - ch) / 2, width: cw, height: ch }
})

const covers = (r: CensorDraft) => r.video !== 'none'
/** The covers playing now, in the order the worker draws them; the one being edited among them. */
const active = computed(() => (props.showActive ? censorOrder(props.rows).filter((r) => covers(r) && isOn(r, props.time)) : []))
const editing = computed(() => props.rows.find((r) => r.key === props.selected && covers(r)) ?? null)
const editingLive = computed(() => !!editing.value && isOn(editing.value, props.time))
/** With the drafts hidden (a file that has them), the box being edited is still drawn while it plays. */
const drawn = computed(() => (props.showActive ? active.value : editing.value && editingLive.value ? [editing.value] : []))

/** Screen px per frame px. */
const scale = computed(() => (props.frame.w > 0 ? box.value.width / props.frame.w : 0))
const pct = (v: number) => `${v * 100}%`
const place = (r: CensorRegion | null) => (r ? { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) } : { inset: '0' })

/** One cover as the worker draws it: its box on the frame's even pixels, the blur's radius, the pixel block. */
function coverStyle(r: CensorDraft): Record<string, string> {
  const k = scale.value
  const b = boxPx(r.region, props.frame.w, props.frame.h)
  const style: Record<string, string> = { left: `${b.x * k}px`, top: `${b.y * k}px`, width: `${b.w * k}px`, height: `${b.h * k}px` }
  if (r.video === 'color') style.background = r.color
  if (r.video === 'blur') style['--blur'] = `${blurRadius(r.region ? b : boxPx(null, props.frame.w, props.frame.h), aloneCover(drawn.value)) * k}px`
  if (r.video === 'pixelate') style['--block'] = `${pixelBlock(b) * k}px`
  return style
}

/** ffmpeg.text_filter: the size and outline for the box, centred in it, not clipped to it. */
function textStyle(r: CensorDraft): Record<string, string> {
  const k = scale.value
  const { size, border } = textSize(boxPx(r.region, props.frame.w, props.frame.h), r.text)
  return { fontSize: `${size * k}px`, WebkitTextStroke: `${2 * border * k}px #000` }
}

// ---- draw, move, resize (pointer capture on the content box) ----
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw'
let drag: { handle: Handle; from: { x: number; y: number }; start: CensorRegion } | null = null

function at(e: PointerEvent): { x: number; y: number } {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) }
}

function down(e: PointerEvent) {
  const r = editing.value
  if (!r || e.button !== 0) return
  const handle = ((e.target as HTMLElement).dataset.handle as Handle | undefined) ?? 'draw'
  const p = at(e)
  drag = { handle, from: p, start: handle === 'draw' ? { x: p.x, y: p.y, w: 0, h: 0 } : { ...(r.region ?? { x: 0, y: 0, w: 1, h: 1 }) } }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function move(e: PointerEvent) {
  const r = editing.value
  if (!drag || !r) return
  const p = at(e)
  const s = drag.start
  const dx = p.x - drag.from.x
  const dy = p.y - drag.from.y
  let next: CensorRegion
  if (drag.handle === 'move') next = { ...s, x: s.x + dx, y: s.y + dy }
  else if (drag.handle === 'draw') next = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }
  else {
    // The corner opposite the handle stays put.
    const left = drag.handle.includes('w') ? Math.min(s.x + dx, s.x + s.w - REGION_MIN) : s.x
    const top = drag.handle.includes('n') ? Math.min(s.y + dy, s.y + s.h - REGION_MIN) : s.y
    const right = drag.handle.includes('e') ? Math.max(s.x + s.w + dx, s.x + REGION_MIN) : s.x + s.w
    const bottom = drag.handle.includes('s') ? Math.max(s.y + s.h + dy, s.y + REGION_MIN) : s.y + s.h
    next = { x: Math.max(0, left), y: Math.max(0, top), w: Math.min(1, right) - Math.max(0, left), h: Math.min(1, bottom) - Math.max(0, top) }
  }
  if (drag.handle !== 'draw' || (next.w >= REGION_MIN && next.h >= REGION_MIN)) r.region = fitRegion(next)
}

function up(e: PointerEvent) {
  drag = null
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}

/** Arrow keys move the box by 1% of the frame; with Shift they resize it. */
function key(e: KeyboardEvent) {
  const r = editing.value
  const d = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key]
  if (!r?.region || !d) return
  e.preventDefault()
  const [dx, dy] = d as [number, number]
  r.region = fitRegion(e.shiftKey ? { ...r.region, w: r.region.w + dx, h: r.region.h + dy } : { ...r.region, x: r.region.x + dx, y: r.region.y + dy })
}
</script>

<template>
  <div ref="frame" class="layer">
    <div
      class="content"
      :class="{ drawing: editing }"
      :style="{ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` }"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <div v-for="r in drawn" :key="r.key" class="cover" :class="`is-${r.video}`" :style="coverStyle(r)">
        <span v-if="censorText(r.text)" class="say" :style="textStyle(r)">{{ censorText(r.text) }}</span>
      </div>
      <div
        v-if="editing && (editing.region || editingLive)"
        class="cover selected"
        :class="{ boxed: editing.region, live: editingLive }"
        :style="place(editing.region)"
        :data-handle="editing.region ? 'move' : undefined"
        :tabindex="editing.region ? 0 : -1"
        role="slider"
        aria-label="Censor box: drag to move, arrow keys to move, Shift + arrows to resize"
        :aria-valuetext="editing.region ? `${Math.round(editing.region.w * 100)}% by ${Math.round(editing.region.h * 100)}% at ${Math.round(editing.region.x * 100)}%, ${Math.round(editing.region.y * 100)}%` : 'Whole frame'"
        @keydown="key"
      >
        <template v-if="editing.region">
          <span v-for="h in ['nw', 'ne', 'sw', 'se']" :key="h" class="handle" :class="h" :data-handle="h" />
        </template>
      </div>
      <p v-if="editing && !editing.region" class="hint">Drag over the picture to draw a box (or leave it covering the whole frame).</p>
    </div>
  </div>
</template>

<style scoped>
.layer { position: absolute; inset: 0; pointer-events: none; }
.content { position: absolute; overflow: hidden; }
.content.drawing { pointer-events: auto; cursor: crosshair; touch-action: none; }
.cover { position: absolute; pointer-events: none; }
.is-black { background: #000; }
/* boxblur's radius run three times is about a Gaussian of that standard deviation, which is what CSS blur() takes. */
.is-blur { backdrop-filter: blur(var(--blur)); -webkit-backdrop-filter: blur(var(--blur)); }
/* Pixelate, roughly: a blur under a grid of the worker's blocks. */
.is-pixelate {
  backdrop-filter: blur(calc(var(--block) / 2)) saturate(0.8); -webkit-backdrop-filter: blur(calc(var(--block) / 2)) saturate(0.8);
  background-image: linear-gradient(rgb(0 0 0 / 0.18) 1px, transparent 1px), linear-gradient(90deg, rgb(0 0 0 / 0.18) 1px, transparent 1px);
  background-size: var(--block) var(--block);
}
.selected { outline: 2px dashed var(--vods-accent); outline-offset: -1px; }
/* Without a box the whole frame is outlined, and a drag on it draws one. */
.selected.boxed { pointer-events: auto; cursor: move; }
/* Outside its time the box is only an outline with a tint, so the picture under it can be lined up. */
.selected:not(.live) { background: rgb(255 255 255 / 0.06); }
.selected:focus-visible { outline-style: solid; }
.handle {
  position: absolute; width: 14px; height: 14px; margin: -7px; border-radius: 3px;
  background: var(--vods-accent); box-shadow: 0 0 0 2px rgb(0 0 0 / 0.5);
}
.nw { left: 0; top: 0; cursor: nwse-resize; }
.ne { right: 0; top: 0; cursor: nesw-resize; }
.sw { left: 0; bottom: 0; cursor: nesw-resize; }
.se { right: 0; bottom: 0; cursor: nwse-resize; }
.hint {
  position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); margin: 0; padding: 4px 10px;
  border-radius: 999px; background: rgb(0 0 0 / 0.65); color: #fff; font-size: 12px; pointer-events: none; white-space: nowrap;
}
@media (pointer: coarse) { .handle { width: 22px; height: 22px; margin: -11px; } }
/* drawtext: one line centred in the box (not clipped to it), white over a black outline; the stroke is centred on the
   glyph's edge, so it is twice the worker's borderw and painted under the fill. */
.say {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center;
  font-family: 'DejaVu Sans', Verdana, sans-serif; font-weight: 700; line-height: 1; white-space: nowrap;
  color: #fff; paint-order: stroke fill; pointer-events: none;
}
</style>
