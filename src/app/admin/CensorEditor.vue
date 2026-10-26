<script setup lang="ts">
// What the YouTube uploads hide: stretches to blur, black out or mute, for what Twitch allows and YouTube doesn't
// (in-game nudity, say). The worker applies them to every upload after they're saved; the uploads already on YouTube
// keep what they had until the VOD is re-archived (the actions above).
import { useToast } from '@vex/ui/utils'
import type { Option } from '@vex/ui'
import { computed, onBeforeUnmount, watchEffect } from 'vue'
import { toClock } from '../../index'
import type { AdminVod } from './api'
import { CENSOR_NOTE_MAX, censorDrafts, censorEdits, censorErrors, censoredSeconds, duplicateCensor, newCensor, type CensorDraft, type CensorVideo } from './edits'
import { seekTo, usePreview } from './preview/previewState'
import EditorRows from './EditorRows.vue'
import { admin } from './session'
import TimeInput from './TimeInput.vue'
import { useDraftEditor } from './useDraftEditor'

const props = defineProps<{ vod: AdminVod; duration: number }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const VIDEO: Option<CensorVideo>[] = [
  { value: 'none', label: 'Picture as is' },
  { value: 'blur', label: 'Blur' },
  { value: 'pixelate', label: 'Pixelate' },
  { value: 'black', label: 'Black out' },
  { value: 'color', label: 'Fill with a colour' },
]

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

// The preview above draws and edits the selected range's box: it gets the same draft rows.
const preview = usePreview()
watchEffect(() => preview && (preview.censor.value = rows.value))
onBeforeUnmount(() => preview && ((preview.censor.value = null), (preview.selected.value = null)))
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
      Blur, pixelate, black out, fill or mute stretches of the uploads, the whole picture or only a box drawn in the
      preview, for what Twitch allows and YouTube doesn't. Saved ranges apply
      to every upload from then on; <template v-if="uploaded">the parts already on YouTube keep what they had until
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
      <UiCheckbox v-model="r.mute">Mute</UiCheckbox>
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
        <UiButton variant="ghost" icon :label="`Remove range ${i + 1}`" @click="remove(r)">×</UiButton>
      </span>
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
</style>
