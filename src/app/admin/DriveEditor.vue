<script setup lang="ts">
// A VOD's Google Drive files (the watch page's download button). Paste a Drive link or the file id.
import { useToast } from '@vex/ui/utils'
import type { Option } from '@vex/ui'
import type { AdminVod } from './api'
import { driveDrafts, driveEdits, driveErrors, driveId, newDrive, type DriveDraft } from './edits'
import EditorRows from './EditorRows.vue'
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
  <EditorRows
    :rows="rows"
    :errors="errors"
    :error="error"
    error-title="Couldn't save the Drive files"
    empty-text="No Drive files."
    :dirty="dirty"
    :saving="saving"
    save-label="Save files"
    @undo="reset"
    @save="save"
  >
    <template #row="{ row: r, index: i }">
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
    </template>
    <template #actions><UiButton @click="rows.push(newDrive())">+ Add file</UiButton></template>
  </EditorRows>
</template>

<style scoped>
.id { flex: 1 1 200px; }
</style>
