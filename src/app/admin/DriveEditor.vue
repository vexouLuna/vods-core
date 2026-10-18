<script setup lang="ts">
// A VOD's Google Drive files (the watch page's download button). Paste a Drive link or the file id.
import { useToast } from '@vex/ui/utils'
import type { Option } from '@vex/ui'
import type { AdminVod } from './api'
import { driveDrafts, driveEdits, driveErrors, driveId, newDrive, type DriveDraft } from './edits'
import { admin } from './session'
import { useDraftEditor } from './useDraftEditor'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const TYPES: Option<'vod' | 'live'>[] = [
  { value: 'vod', label: 'VOD' },
  { value: 'live', label: 'Live' },
]

const { rows, error, saving, dirty, errors, reset, save, remove } = useDraftEditor<DriveDraft>({
  source: () => [props.vod.id, props.vod.drive],
  drafts: () => driveDrafts(props.vod.drive),
  edits: driveEdits,
  validate: driveErrors,
  async save(rows) {
    emit('saved', await admin.saveDrive(props.vod.id, driveEdits(rows)))
    toast.show('Drive files saved', { duration: 3000 })
  },
})
</script>

<template>
  <div class="drive">
    <p v-if="!rows.length" class="vods-muted empty">No Drive files.</p>
    <ol class="rows">
      <li v-for="(r, i) in rows" :key="r.key" class="row" :class="{ 'has-error': errors.has(r.key) }">
        <UiInput
          class="id"
          mono
          :model-value="r.id"
          :aria-label="`File ${i + 1} id`"
          placeholder="Drive file id or link"
          @change="r.id = driveId(($event.target as HTMLInputElement).value)"
        />
        <UiSelect v-model="r.type" :options="TYPES" width="88px" />
        <UiButton v-if="r.id" variant="ghost" :href="`https://drive.google.com/file/d/${encodeURIComponent(r.id)}/view`" external>Open ↗</UiButton>
        <UiButton variant="ghost" icon :label="`Remove file ${i + 1}`" @click="remove(r)">×</UiButton>
        <p v-if="errors.has(r.key)" class="err">{{ errors.get(r.key) }}</p>
      </li>
    </ol>
    <UiCallout v-if="error" tone="error" title="Couldn't save the Drive files">{{ error }}</UiCallout>
    <div class="foot">
      <UiButton @click="rows.push(newDrive())">+ Add file</UiButton>
      <span class="spacer" />
      <UiButton :disabled="!dirty || saving" @click="reset">Undo changes</UiButton>
      <UiButton variant="primary" :loading="saving" :disabled="!dirty || errors.size > 0" @click="save">Save files</UiButton>
    </div>
  </div>
</template>

<style scoped>
.drive { display: flex; flex-direction: column; gap: 10px; }
.empty { margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 8px;
  border-radius: var(--vods-radius); background: rgb(255 255 255 / 0.03);
}
.row.has-error { box-shadow: inset 0 0 0 1px var(--vods-bad); }
.id { flex: 1 1 200px; }
.err { flex-basis: 100%; margin: 0; color: var(--vods-bad); font-size: 12px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1; }
</style>
