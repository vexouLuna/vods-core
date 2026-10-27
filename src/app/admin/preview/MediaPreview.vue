<script setup lang="ts">
// Manage → VOD's preview: the VOD's file on the server (the source, or what the censor step made of it) or its YouTube
// uploads, seekable frame by frame, with the censor ranges on a timeline and their boxes drawn over the picture. The
// chapters and censor editors below set times from its playhead and jump it (previewState).
//
// Only one browser tab on the whole server streams a server file at a time (useMediaLease): when another has it, this
// says who and since when, offers YouTube instead, or takes it over behind a warning. Drafts are never touched.
import { errorText, stamp } from '@vex/platform-web'
import type { Option } from '@vex/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { mountYouTube, normalizeVod, Timeline, toClock, WatchPlayer } from '../../../index'
import { timeAgo } from '../../lib/time'
import type { AdminVod, MediaHolder, MediaList, MediaName } from '../api'
import { admin } from '../session'
import RegionLayer from './RegionLayer.vue'
import { seekTo, usePreview } from './previewState'
import { useMediaLease } from './useMediaLease'

const props = defineProps<{ vod: AdminVod; duration: number }>()
const preview = usePreview()!

/** One frame: the archive keeps Twitch's frame rate, at most 60; 1/30 s steps land on a frame at 30 and 60 fps. */
const FRAME = 1 / 30

type Source = 'server' | 'youtube'
const source = ref<Source>('server')
const SOURCES: Option<Source>[] = [
  { value: 'server', label: 'Server file' },
  { value: 'youtube', label: 'YouTube' },
]

// ---- what's on the server ----
const list = ref<MediaList | null>(null)
const listError = ref<string | null>(null)
const file = ref<MediaName>('source')
const fileOpts = computed<Option<MediaName>[]>(() => (list.value?.items ?? []).map((f) => ({ value: f.name, label: `${f.label} · ${size(f.size)}` })))
const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`)
/** Why there's no file: the job's cleanup removes them, unless the settings keep them. */
const noFileWhy = computed(() => {
  const l = list.value
  if (!l) return ''
  const kept = l.keep_files_days > 0 ? `for ${l.keep_files_days} day${l.keep_files_days === 1 ? '' : 's'} after it (keep_files_days)` : 'only until it ends (keep_files_days is 0)'
  return `An archive job keeps the VOD's MP4 ${kept}${l.keep_mp4 ? ', and the source for good (keep_mp4)' : ''}. Re-archive the VOD, or turn those on under Settings, to have one here.`
})

async function loadList() {
  listError.value = null
  try {
    list.value = await admin.vodMedia(props.vod.id, lease.lease)
    const names = list.value.items.map((f) => f.name)
    if (!names.includes(file.value)) file.value = names[0] ?? 'source'
    if (!names.length && youtube.value) source.value = 'youtube'
  } catch (e) {
    listError.value = errorText(e)
  }
}

// ---- the lease ----
const lease = useMediaLease(() => props.vod.id)
const who = (h: MediaHolder | null) => (h ? `${h.login ?? 'The password login'} (${h.browser})` : 'Someone')
const since = (h: MediaHolder | null) => (h ? `${timeAgo(h.acquired_at)}, at ${stamp(h.acquired_at)}` : '')
const takeOpen = ref(false)

async function takeOver() {
  takeOpen.value = false
  if (await lease.claim(file.value, true)) await loadServer()
}

// ---- the player ----
const video = ref<HTMLVideoElement | null>(null)
const ytEl = ref<HTMLElement | null>(null)
const playing = ref(false)
const aspect = ref(16 / 9)
const loadError = ref<string | null>(null)
let watch_: WatchPlayer | null = null
let raf = 0

const timeline = computed(() => {
  try {
    return new Timeline(normalizeVod(props.vod))
  } catch {
    return null
  }
})
const youtube = computed(() => !!timeline.value && !timeline.value.isEmpty)
const burnedIn = computed(() => source.value === 'youtube' || file.value !== 'source')
const showDrafts = ref(true)

function tick() {
  if (source.value === 'server' && video.value) preview.time.value = video.value.currentTime
  raf = playing.value ? requestAnimationFrame(tick) : 0
}
watch(playing, (p) => p && !raf && (raf = requestAnimationFrame(tick)))

function stopServer() {
  const v = video.value
  if (!v) return
  v.pause()
  v.removeAttribute('src')
  v.load()
}

function stopYouTube() {
  watch_?.destroy()
  watch_ = null
  if (ytEl.value) ytEl.value.innerHTML = ''
}

async function loadServer() {
  stopYouTube()
  preview.ready.value = false
  if (!list.value?.items.length) return
  if (lease.state.value !== 'held' && !(await lease.claim(file.value))) return
  await nextTick()
  const v = video.value
  if (!v) return
  const at = preview.time.value
  v.src = admin.mediaUrl(props.vod.id, file.value, lease.lease)
  v.addEventListener('loadedmetadata', () => {
    if (v.videoWidth && v.videoHeight) aspect.value = v.videoWidth / v.videoHeight
    v.currentTime = at
    preview.ready.value = true
  }, { once: true })
  preview.seeker.value = (t) => (v.currentTime = t)
}

async function loadYouTube() {
  stopServer()
  await lease.release()
  preview.ready.value = false
  aspect.value = 16 / 9
  const tl = timeline.value
  await nextTick()
  if (!tl || tl.isEmpty || !ytEl.value) return
  const host = document.createElement('div')
  ytEl.value.replaceChildren(host)
  const wp = (watch_ = new WatchPlayer(tl, { skipBroken: false }))
  wp.on('time', (t) => (preview.time.value = t))
  wp.on('playing', (p) => (playing.value = p))
  try {
    await mountYouTube(host, wp, { start: tl.locate(preview.time.value), autoplay: false, controls: false })
    preview.seeker.value = (t) => wp.seek(t)
    preview.ready.value = true
  } catch (e) {
    loadError.value = errorText(e)
  }
}

watch([source, file], async ([s]) => {
  loadError.value = null
  if (s === 'youtube') await loadYouTube()
  else await loadServer()
})

// Another tab took the files: stop here (the server closes the stream too) and keep the playhead.
watch(lease.state, (s) => {
  if (s === 'lost') {
    stopServer()
    playing.value = false
    preview.ready.value = false
  }
})

onMounted(async () => {
  const before = `${source.value}/${file.value}`
  await loadList()
  // A changed source or file loads through the watcher above.
  if (`${source.value}/${file.value}` === before) await (source.value === 'server' ? loadServer() : loadYouTube())
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  stopYouTube()
  preview.seeker.value = null
  preview.ready.value = false
})

// ---- controls ----
function toggle() {
  if (source.value === 'youtube') {
    if (watch_?.isPlaying()) watch_.pause()
    else watch_?.play()
    return
  }
  const v = video.value
  if (!v) return
  if (v.paused) void v.play()
  else v.pause()
}
function step(by: number) {
  if (source.value === 'server') video.value?.pause()
  else watch_?.pause()
  seekTo(preview, Math.min(Math.max(0, preview.time.value + by), props.duration || Infinity))
}

// ---- the censor ranges ----
const rows = computed(() => preview.censor.value ?? [])
const selectedRow = computed(() => rows.value.find((r) => r.key === preview.selected.value) ?? null)
const len = computed(() => props.duration || 1)
const at = (t: number) => `${(Math.min(Math.max(t, 0), len.value) / len.value) * 100}%`

const bar = ref<HTMLElement | null>(null)
let dragEnd: { key: number; end: 'start' | 'end' } | null = null
function barTime(e: PointerEvent) {
  const rect = bar.value!.getBoundingClientRect()
  return Math.round(Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1) * len.value * 10) / 10
}
function barDown(e: PointerEvent) {
  const t = e.target as HTMLElement
  if (t.dataset.end) {
    dragEnd = { key: Number(t.dataset.key), end: t.dataset.end as 'start' | 'end' }
    bar.value!.setPointerCapture(e.pointerId)
    e.preventDefault()
  } else if (t.dataset.key) {
    preview.selected.value = Number(t.dataset.key)
    seekTo(preview, barTime(e))
  } else seekTo(preview, barTime(e))
}
function barMove(e: PointerEvent) {
  if (!dragEnd) return
  const r = rows.value.find((x) => x.key === dragEnd!.key)
  if (!r) return
  const t = barTime(e)
  if (dragEnd.end === 'start') r.start = Math.min(t, (r.end ?? len.value) - 0.1)
  else r.end = Math.max(t, (r.start ?? 0) + 0.1)
  seekTo(preview, t)
}
function barUp() {
  dragEnd = null
}
function setEnd(end: 'start' | 'end') {
  const r = selectedRow.value
  if (r) r[end] = Math.round(preview.time.value * 1000) / 1000
}
</script>

<template>
  <div class="preview">
    <div class="top">
      <UiSegmented v-model="source" :options="SOURCES" label="Preview source" />
      <UiSelect v-if="source === 'server' && fileOpts.length" v-model="file" :options="fileOpts" width="260px" aria-label="Server file" />
      <UiCheckbox v-model="showDrafts">Draw the censor drafts</UiCheckbox>
    </div>

    <UiCallout v-if="listError" tone="error" title="Couldn't list the server's files">
      {{ listError }}
      <template #actions><UiButton size="sm" @click="loadList">Try again</UiButton></template>
    </UiCallout>
    <template v-if="source === 'server' && list">
      <UiCallout v-if="!list.items.length" tone="info" title="No file of this VOD on the server">
        {{ noFileWhy }}<template v-if="youtube"> Its YouTube uploads can be previewed instead.</template>
      </UiCallout>
      <UiCallout v-else-if="lease.state.value === 'in_use'" tone="warn" title="Another tab is playing the server's files">
        {{ who(lease.holder.value) }} has had them since {{ since(lease.holder.value) }}<template v-if="lease.holder.value?.vod_id">, on VOD {{ lease.holder.value.vod_id }}</template>.
        Only one tab on the whole server can stream them at a time.
        <template #actions>
          <span class="acts">
            <UiButton v-if="youtube" size="sm" @click="source = 'youtube'">Use YouTube instead</UiButton>
            <UiButton size="sm" @click="loadServer">Try again</UiButton>
            <UiButton size="sm" variant="danger" @click="takeOpen = true">Use it here instead</UiButton>
          </span>
        </template>
      </UiCallout>
      <UiCallout v-else-if="lease.state.value === 'lost'" tone="error" title="Another tab took the server's files">
        {{ who(lease.holder.value) }} took them {{ since(lease.holder.value) }}. The preview stopped here; your drafts are as you left them.
        <template #actions>
          <span class="acts">
            <UiButton v-if="youtube" size="sm" @click="source = 'youtube'">Use YouTube instead</UiButton>
            <UiButton size="sm" variant="danger" @click="takeOpen = true">Take them back</UiButton>
          </span>
        </template>
      </UiCallout>
      <UiCallout v-else-if="lease.state.value === 'error'" tone="error" title="Couldn't get the server's files">
        {{ lease.error.value }}
        <template #actions><UiButton size="sm" @click="loadServer">Try again</UiButton></template>
      </UiCallout>
    </template>
    <UiCallout v-if="source === 'youtube' && !youtube" tone="info" title="Nothing on YouTube yet">This VOD has no uploads to preview.</UiCallout>
    <UiCallout v-if="loadError" tone="error" title="Couldn't load the player">{{ loadError }}</UiCallout>

    <div class="stage" :style="{ aspectRatio: String(aspect) }">
      <video
        v-show="source === 'server'"
        ref="video"
        class="media"
        playsinline
        preload="metadata"
        @play="playing = true"
        @pause="playing = false"
        @timeupdate="preview.time.value = video!.currentTime"
        @error="lease.state.value === 'held' && (loadError = 'The file could not be played.')"
      />
      <div v-show="source === 'youtube'" ref="ytEl" class="media yt" />
      <RegionLayer :aspect="aspect" :rows="rows" :time="preview.time.value" :selected="preview.selected.value" :show-active="showDrafts && !burnedIn" />
    </div>
    <p v-if="burnedIn" class="vods-muted small">
      {{ source === 'youtube' ? 'The uploads have the censor ranges they were made with.' : 'This file has the censor ranges it was made with.' }}
      The drafts aren't drawn over it, except the one being edited.
    </p>

    <div class="controls">
      <UiButton size="sm" :disabled="!preview.ready.value" label="Back 1 second" @click="step(-1)">−1 s</UiButton>
      <UiButton size="sm" :disabled="!preview.ready.value" label="Back 1 frame" @click="step(-FRAME)">−1 f</UiButton>
      <UiButton size="sm" variant="primary" :disabled="!preview.ready.value" @click="toggle">{{ playing ? 'Pause' : 'Play' }}</UiButton>
      <UiButton size="sm" :disabled="!preview.ready.value" label="Forward 1 frame" @click="step(FRAME)">+1 f</UiButton>
      <UiButton size="sm" :disabled="!preview.ready.value" label="Forward 1 second" @click="step(1)">+1 s</UiButton>
      <span class="vods-mono clock">{{ toClock(preview.time.value) }}.{{ String(Math.floor((preview.time.value % 1) * 10)) }} / {{ toClock(duration) }}</span>
      <span class="spacer" />
      <template v-if="selectedRow">
        <UiButton size="sm" @click="setEnd('start')">Set start here</UiButton>
        <UiButton size="sm" @click="setEnd('end')">Set end here</UiButton>
      </template>
    </div>

    <div
      ref="bar"
      class="bar"
      role="slider"
      aria-label="Playhead and censor ranges"
      :aria-valuemin="0"
      :aria-valuemax="duration"
      :aria-valuenow="Math.round(preview.time.value)"
      :aria-valuetext="toClock(preview.time.value)"
      @pointerdown="barDown"
      @pointermove="barMove"
      @pointerup="barUp"
      @pointercancel="barUp"
    >
      <div
        v-for="r in rows.filter((x) => x.start != null && x.end != null)"
        :key="r.key"
        class="range"
        :class="[`is-${r.video}`, { selected: r.key === preview.selected.value }]"
        :style="{ left: at(r.start!), width: `calc(${at(r.end!)} - ${at(r.start!)})` }"
        :data-key="r.key"
        :title="`${toClock(r.start!)} – ${toClock(r.end!)}`"
      >
        <template v-if="r.key === preview.selected.value">
          <span class="end s" :data-key="r.key" data-end="start" />
          <span class="end e" :data-key="r.key" data-end="end" />
        </template>
      </div>
      <div class="playhead" :style="{ left: at(preview.time.value) }" />
    </div>
  </div>

  <UiDialog v-model:open="takeOpen" title="Take the server's files from the other tab?" width="500px">
    <UiCallout tone="error" title="This stops their preview at once">
      {{ who(lease.holder.value) }} is using them<template v-if="lease.holder.value"> (since {{ since(lease.holder.value) }})</template>.
      Their video stops mid-play, and they'll see that you took it and when. They can take it back the same way.
    </UiCallout>
    <p class="vods-muted small">Only one tab on the whole server streams these files, to spare the disk and the connection. The take-over is written to the audit log.</p>
    <template #actions="{ close }">
      <UiButton @click="close">Cancel</UiButton>
      <UiButton variant="danger-solid" @click="takeOver">Stop their preview and use it here</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
/* The callout keeps its buttons on one row; on a phone they wrap. */
.acts { display: flex; flex-wrap: wrap; gap: 6px; }
.preview { display: flex; flex-direction: column; gap: 10px; }
.top, .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.stage { position: relative; width: 100%; max-height: 70vh; background: #000; border-radius: var(--vods-radius); overflow: hidden; }
.media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.yt :deep(iframe) { width: 100%; height: 100%; border: 0; }
.clock { font-size: 13px; }
.spacer { flex: 1; }
.small { margin: 0; font-size: 12px; }
.bar {
  position: relative; height: 28px; border-radius: var(--vods-radius); background: rgb(255 255 255 / 0.06);
  cursor: pointer; touch-action: none;
}
.range { position: absolute; top: 4px; bottom: 4px; min-width: 3px; border-radius: 3px; background: rgb(255 255 255 / 0.35); }
.range.is-black { background: rgb(0 0 0 / 0.8); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.3); }
.range.is-color { background: rgb(255 160 0 / 0.6); }
.range.is-pixelate { background: rgb(120 160 255 / 0.55); }
.range.is-none { background: rgb(255 255 255 / 0.15); border: 1px dashed rgb(255 255 255 / 0.4); }
.range.selected { outline: 2px solid var(--vods-accent); z-index: 1; }
.end { position: absolute; top: -4px; bottom: -4px; width: 10px; border-radius: 3px; background: var(--vods-accent); cursor: ew-resize; }
.end.s { left: -5px; }
.end.e { right: -5px; }
.playhead { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--vods-accent); pointer-events: none; z-index: 2; }
</style>
