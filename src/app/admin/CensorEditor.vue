<script setup lang="ts">
// What the YouTube uploads hide: stretches to blur, black out (with text over it) or mute, muffle or put a song over, for what Twitch allows and YouTube doesn't
// (in-game nudity, say). The worker applies them to every upload after they're saved; the uploads already on YouTube
// keep what they had until the VOD is re-archived (the actions above).
import { useToast } from '@vex/ui/utils'
import type { Option } from '@vex/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { toClock } from '../../index'
import { moved } from '../lib/reorder'
import type { AdminVod, CensorSong } from './api'
import {
  CENSOR_NOTE_MAX, CENSOR_TEXT_MAX, censorDrafts, censorEdits, censorErrors, censoredSeconds, duplicateCensor, newCensor,
  type CensorDraft, type CensorSound, type CensorVideo,
} from './edits'
import SongLibrary from './SongLibrary.vue'
import { seekTo, usePreview } from './preview/previewState'
import EditorRows from './EditorRows.vue'
import { admin } from './session'
import TimeInput from './TimeInput.vue'
import { useDraftEditor } from './useDraftEditor'

const props = defineProps<{ vod: AdminVod; duration: number }>()
const emit = defineEmits<{ saved: [vod: AdminVod]; draft: [rows: number, dirty: boolean] }>()
const toast = useToast()

const VIDEO: Option<CensorVideo>[] = [
  { value: 'none', label: 'Picture as is' },
  { value: 'blur', label: 'Blur' },
  { value: 'pixelate', label: 'Pixelate' },
  { value: 'black', label: 'Black out' },
  { value: 'color', label: 'Fill with a colour' },
]

const SOUND: Option<CensorSound>[] = [
  { value: 'none', label: 'Sound as is' },
  { value: 'mute', label: 'Mute' },
  { value: 'muffle', label: 'Muffle' },
  { value: 'song', label: 'Song over it' },
]

// The song library: a range picks one of these; an older worker has no /songs (404), so the list stays empty.
const songs = ref<CensorSong[]>([])
async function loadSongs() {
  try {
    songs.value = (await admin.songs()).items
  } catch {
    songs.value = []
  }
}
onMounted(loadSongs)
const songOptions = computed<Option<string>[]>(() => [
  { value: '', label: songs.value.length ? 'Pick a song' : 'No songs: upload one below' },
  ...songs.value.map((s) => ({ value: s.id, label: s.name })),
])

const { rows, error, saving, dirty, errors, reset, save, remove } = useDraftEditor<CensorDraft>({
  source: () => [props.vod.id, props.vod.censor],
  drafts: () => censorDrafts(props.vod.censor),
  edits: censorEdits,
  validate: (rows) => censorErrors(rows, props.duration),
  async save(rows) {
    emit('saved', await admin.saveCensor(props.vod.id, censorEdits(rows)))
    toast.show('Censor ranges saved. Re-archive the VOD to apply them to its uploads.', { duration: 6000 })
  },
})

// The Timeline workbench's tab shows the row count and marks unsaved changes.
watch([() => rows.value.length, dirty], ([n, d]) => emit('draft', n, d), { immediate: true })

// The preview beside it draws and edits the selected range's box: it gets the same draft rows.
const preview = usePreview()
watchEffect(() => preview && (preview.censor.value = rows.value))
onBeforeUnmount(() => preview && ((preview.censor.value = null), (preview.selected.value = null)))
// A selected range that was removed (or an add undone) leaves no row to show it on.
watch(
  () => rows.value.map((r) => r.key),
  (keys) => preview && preview.selected.value != null && !keys.includes(preview.selected.value) && (preview.selected.value = null),
)
function edit(r: CensorDraft) {
  if (!preview) return
  preview.selected.value = preview.selected.value === r.key ? null : r.key
  if (preview.selected.value != null && r.start != null) seekTo(preview, r.start)
}
function add() {
  const r = newCensor(rows.value, props.duration, preview?.ready.value ? preview.time.value : undefined)
  rows.value.push(r)
  if (preview) preview.selected.value = r.key
}
function duplicate(r: CensorDraft) {
  const copy = duplicateCensor(r)
  rows.value.splice(rows.value.indexOf(r) + 1, 0, copy)
  if (preview) preview.selected.value = copy.key
}
/** Up or down the list: the worker applies the ranges in this order. */
const move = (r: CensorDraft, by: -1 | 1) => (rows.value = moved(rows.value, rows.value.indexOf(r), by))
const pct = (v: number) => `${Math.round(v * 100)}%`

const hidden = computed(() => censoredSeconds(props.vod.censor ?? []))
const uploaded = computed(() => (props.vod.youtube ?? []).length > 0)
</script>

<template>
  <EditorRows
    :rows="rows"
    :errors="errors"
    :error="error"
    error-title="Couldn't save the censor ranges"
    empty-text="Nothing hidden."
    :dirty="dirty"
    :saving="saving"
    save-label="Save ranges"
    :row-class="(r) => ({ editing: preview?.selected.value === r.key })"
    @undo="reset"
    @save="save"
  >
    <p class="vods-muted note">
      Blur, pixelate, black out or fill stretches of the uploads (the whole picture or only a box drawn in the
      preview, with text over it if you like), and mute, muffle or put a song over their sound, for what Twitch allows
      and YouTube doesn't. Where ranges overlap they apply in this list's order (↑ ↓ to change it), each over the ones
      before: a song after a mute plays, a mute after a song silences it, a later box is drawn over an earlier one. Saved ranges apply to every upload from then on; <template v-if="uploaded">the parts already on YouTube keep what they had until
      you re-archive the VOD.</template><template v-else>nothing is on YouTube yet.</template>
      The VOD on this site is never changed.
    </p>
    <p v-if="rows.length && hidden && !dirty" class="vods-muted note">{{ toClock(hidden) }} hidden.</p>
    <template #row="{ row: r, index: i }">
      <TimeInput v-model="r.start" seekable placeholder="start" :label="`Range ${i + 1} start`" :invalid="errors.has(r.key)" />
      <span class="vods-muted">to</span>
      <TimeInput v-model="r.end" seekable placeholder="end" :label="`Range ${i + 1} end`" :invalid="errors.has(r.key)" />
      <UiSelect v-model="r.video" :options="VIDEO" width="170px" :aria-label="`Range ${i + 1} picture`" />
      <input v-if="r.video === 'color'" v-model="r.color" type="color" class="swatch" :aria-label="`Range ${i + 1} colour`" />
      <UiInput
        v-if="r.video !== 'none'"
        v-model="r.text"
        class="text"
        :maxlength="CENSOR_TEXT_MAX"
        placeholder="Text over it (optional)"
        :aria-label="`Range ${i + 1} text`"
      />
      <UiSelect v-model="r.sound" :options="SOUND" width="150px" :aria-label="`Range ${i + 1} sound`" />
      <template v-if="r.sound === 'song'">
        <UiSelect v-model="r.song" :options="songOptions" width="190px" :aria-label="`Range ${i + 1} song`" />
        <span class="volume">
          <UiSlider v-model="r.volume" :min="0" :max="100" :step="5" :label="`Range ${i + 1} song volume`" class="slider" />
          <span class="vods-muted">{{ r.volume }}%</span>
        </span>
      </template>
      <UiInput
        v-model="r.note"
        class="what"
        :maxlength="CENSOR_NOTE_MAX"
        placeholder="Why (optional)"
        :aria-label="`Range ${i + 1} note`"
      />
      <span class="tools">
        <UiChip v-if="r.region" :title="`From ${pct(r.region.x)}, ${pct(r.region.y)}`">box {{ pct(r.region.w) }} × {{ pct(r.region.h) }}</UiChip>
        <UiChip v-else-if="r.video !== 'none'">whole frame</UiChip>
        <UiButton v-if="preview && r.video !== 'none'" size="sm" :variant="preview.selected.value === r.key ? 'primary' : 'default'" @click="edit(r)">
          {{ preview.selected.value === r.key ? 'Done' : r.region ? 'Edit box' : 'Draw a box' }}
        </UiButton>
        <UiButton v-if="r.region" size="sm" variant="ghost" @click="r.region = null">Whole frame</UiButton>
        <UiButton size="sm" variant="ghost" :label="`Duplicate range ${i + 1}`" title="Duplicate: another box at the same time" @click="duplicate(r)">Duplicate</UiButton>
        <UiButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move range ${i + 1} up (applied earlier)`" @click="move(r, -1)">↑</UiButton>
        <UiButton size="sm" variant="ghost" :disabled="i === rows.length - 1" :aria-label="`Move range ${i + 1} down (applied later)`" @click="move(r, 1)">↓</UiButton>
        <UiButton variant="ghost" icon :label="`Remove range ${i + 1}`" @click="remove(r)">×</UiButton>
      </span>
    </template>
    <template #after>
      <SongLibrary :songs="songs" @changed="loadSongs" />
    </template>
    <template #actions>
      <UiButton @click="add">{{ preview?.ready.value ? '+ Add range at the playhead' : '+ Add range' }}</UiButton>
    </template>
  </EditorRows>
</template>

<style scoped>
.note { margin: 0; }
:deep(.vods-editor-row.editing) { box-shadow: inset 0 0 0 1px var(--vods-accent); }
.tools { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
.swatch { width: 34px; height: 30px; padding: 0; border: 0; background: none; cursor: pointer; }
.what { flex: 1 1 180px; }
.text { flex: 1 1 170px; }
.volume { display: inline-flex; align-items: center; gap: 6px; flex: 0 1 180px; }
.slider { flex: 1 1 110px; min-width: 90px; }
</style>
