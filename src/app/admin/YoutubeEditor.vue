<script setup lang="ts">
// A VOD's YouTube parts: video id (paste a URL or the id), vod/live set, part number, duration. Existing videos keep
// their thumbnail; leave duration empty to keep the archive's (or while YouTube is processing).
import { useToast } from '@vex/ui/utils'
import type { Option } from '@vex/ui'
import { errorText } from '@vex/platform-web'
import { computed, ref } from 'vue'
import type { RawUpload } from '../../index'
import type { AdminVod } from './api'
import { newYoutube, youtubeDrafts, youtubeEdits, youtubeErrors, youtubeId, type YoutubeDraft } from './edits'
import EditorRows from './EditorRows.vue'
import { admin } from './session'
import TimeInput from './TimeInput.vue'
import { useDraftEditor } from './useDraftEditor'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const TYPES: Option<'vod' | 'live'>[] = [
  { value: 'vod', label: 'VOD', sub: 'From the Twitch VOD' },
  { value: 'live', label: 'Live', sub: 'From the live recording' },
]

const { rows, error, saving, dirty, errors, reset, save, remove } = useDraftEditor<YoutubeDraft>({
  source: () => [props.vod.id, props.vod.youtube],
  drafts: () => youtubeDrafts(props.vod.youtube),
  edits: youtubeEdits,
  validate: youtubeErrors,
  async save(rows) {
    emit('saved', await admin.saveYoutube(props.vod.id, youtubeEdits(rows)))
    toast.show('YouTube parts saved', { duration: 3000 })
  },
})

// Delete uploads from YouTube (the saved ones; unsaved rows aren't on the VOD yet)
const delOpen = ref(false)
const delPick = ref<string[]>([])
const deleting = ref(false)
const saved = computed(() => (props.vod.youtube ?? []).filter((u) => u.id))
const label = (u: RawUpload) => `${u.type === 'live' ? 'Live' : 'VOD'} part ${u.part ?? 1} · ${u.id}`
function openDelete() {
  delPick.value = []
  delOpen.value = true
}
function pick(id: string, on: boolean) {
  delPick.value = on ? [...delPick.value.filter((x) => x !== id), id] : delPick.value.filter((x) => x !== id)
}
async function deleteUploads() {
  deleting.value = true
  try {
    const res = await admin.deleteUploads(props.vod.id, delPick.value)
    delOpen.value = false
    emit('saved', res.vod)
    const failed = res.failed.map((f) => `${f.id}: ${f.error}`).join('; ')
    toast.show(failed ? `${res.msg} Not deleted: ${failed}` : res.msg, failed ? { kind: 'error', duration: 10000 } : { duration: 4000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    deleting.value = false
  }
}

function add() {
  rows.value.push(newYoutube(rows.value, rows.value.some((r) => r.type === 'live') && !rows.value.some((r) => r.type === 'vod') ? 'live' : 'vod'))
}
function setId(r: YoutubeDraft, value: string) {
  r.id = youtubeId(value)
}
</script>

<template>
  <EditorRows
    :rows="rows"
    :errors="errors"
    :error="error"
    error-title="Couldn't save the YouTube parts"
    empty-text="No YouTube parts."
    :dirty="dirty"
    :saving="saving"
    save-label="Save parts"
    @undo="reset"
    @save="save"
  >
    <template #row="{ row: r, index: i }">
      <a v-if="r.id && r.thumbnail" :href="`https://youtu.be/${r.id}`" target="_blank" rel="noopener" class="thumb">
        <img :src="r.thumbnail" alt="" loading="lazy" />
      </a>
      <span v-else class="thumb ph" aria-hidden="true" />
      <UiInput
        class="id"
        mono
        :model-value="r.id"
        :aria-label="`Part ${i + 1} video id`"
        placeholder="Video id or YouTube URL"
        @change="setId(r, ($event.target as HTMLInputElement).value)"
      />
      <UiSelect v-model="r.type" :options="TYPES" width="96px" />
      <label class="part">
        <span class="vods-muted">Part</span>
        <UiInput v-model.number="r.part" class="num" mono type="number" min="1" step="1" :aria-label="`Row ${i + 1} part number`" />
      </label>
      <TimeInput v-model="r.duration" optional placeholder="duration" :label="`Part ${i + 1} duration`" />
      <UiButton variant="ghost" icon :label="`Remove row ${i + 1}`" @click="remove(r)">×</UiButton>
    </template>
    <template #actions>
      <UiButton @click="add">+ Add part</UiButton>
      <UiButton variant="danger" :disabled="!saved.length || dirty" :title="dirty ? 'Save or undo the changes first' : undefined" @click="openDelete">Delete from YouTube…</UiButton>
    </template>
    <template #after>
      <UiDialog v-model:open="delOpen" title="Delete from YouTube">
        Deletes the ticked videos from YouTube and takes them off this VOD; the other parts' descriptions are rewritten.
        Each delete costs 50 units of the daily YouTube quota. This can't be undone; to replace uploads instead, use
        Re-archive in the actions.
        <ul class="pick">
          <li v-for="u in saved" :key="u.id">
            <UiCheckbox :model-value="delPick.includes(u.id)" @update:model-value="pick(u.id, $event)">{{ label(u) }}</UiCheckbox>
          </li>
        </ul>
        <template #actions="{ close }">
          <UiButton @click="close">Keep them</UiButton>
          <UiButton variant="danger-solid" :loading="deleting" :disabled="!delPick.length" @click="deleteUploads">
            Delete {{ delPick.length || '' }}
          </UiButton>
        </template>
      </UiDialog>
    </template>
  </EditorRows>
</template>

<style scoped>
.thumb { width: 64px; aspect-ratio: 16 / 9; border-radius: 3px; overflow: hidden; flex: none; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph { background: var(--vods-line); }
.id { flex: 1 1 180px; }
.part { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.num { width: 60px; }
.pick { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
</style>
