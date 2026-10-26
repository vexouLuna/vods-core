<script setup lang="ts">
// Jobs and fixes for one VOD, through the worker's existing routes. Each starts a job (shown in the VOD's job list);
// delete removes the VOD from the archive after typing its id.
import { useToast } from '@vex/ui/utils'
import type { Option } from '@vex/ui'
import { computed, ref } from 'vue'
import { errorText } from '@vex/platform-web'
import { isSpliced, type ActionResult, type AdminVod } from './api'
import { admin } from './session'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ job: [jobId: number]; changed: []; deleted: [] }>()
const toast = useToast()

const TYPES: Option<'vod' | 'live'>[] = [
  { value: 'vod', label: 'VOD', sub: 'The Twitch VOD' },
  { value: 'live', label: 'Live', sub: 'The live recording' },
]
const hasLive = computed(() => (props.vod.youtube ?? []).some((u) => u.type === 'live') || !!props.vod.stream_id)

const busy = ref<string | null>(null)
async function run(name: string, action: () => Promise<ActionResult>, after?: () => void) {
  busy.value = name
  try {
    const res = await action()
    toast.show(res.msg, { duration: 3500 })
    if (res.jobId != null) emit('job', res.jobId)
    after?.()
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    busy.value = null
  }
}

const forceChapters = ref(false)

// Download again
const dlOpen = ref(false)
const dlType = ref<'vod' | 'live'>('vod')
const dlStart = ref('')
const dlEnd = ref('')
const partNum = (v: string) => (v.trim() ? Number(v) : undefined)
const dlBad = computed(() => [dlStart.value, dlEnd.value].some((v) => v.trim() && !(Number.isInteger(Number(v)) && Number(v) >= 1)))
function download() {
  dlOpen.value = false
  run('download', () => admin.redownload(props.vod.id, { type: dlType.value, startPart: partNum(dlStart.value), endPart: partNum(dlEnd.value) }))
}

// Re-upload one part
const ruOpen = ref(false)
const ruType = ref<'vod' | 'live'>('vod')
const ruPart = ref('1')
const ruBad = computed(() => !(Number.isInteger(Number(ruPart.value)) && Number(ruPart.value) >= 1))
function reupload() {
  ruOpen.value = false
  run('reupload', () => admin.reuploadPart(props.vod.id, Number(ruPart.value), ruType.value))
}

// Re-archive: upload again with today's settings and censor ranges, replacing the old uploads
const raOpen = ref(false)
const raType = ref<'vod' | 'live'>('vod')
const raPart = ref('')
const raBad = computed(() => !!raPart.value.trim() && !(Number.isInteger(Number(raPart.value)) && Number(raPart.value) >= 1))
const raOld = computed(() => {
  const part = partNum(raPart.value)
  return (props.vod.youtube ?? []).filter((u) => (u.type ?? 'vod') === raType.value && (part == null || (u.part ?? 1) === part)).length
})
const censored = computed(() => (props.vod.censor ?? []).length)
function rearchive() {
  raOpen.value = false
  run('rearchive', () => admin.rearchive(props.vod.id, { type: raType.value, part: partNum(raPart.value) }))
}

const descType = ref<'vod' | 'live'>('vod')

// A merged or split VOD no longer matches Twitch's VOD of that id: the archive refuses anything that re-fetches it.
const spliced = computed(() => isSpliced(props.vod))
const TWITCH_OFF = 'Merged or split: Twitch’s VOD of this id no longer matches it'

// Delete
const delOpen = ref(false)
function remove() {
  delOpen.value = false
  run('delete', () => admin.deleteVod(props.vod.id), () => emit('deleted'))
}
</script>

<template>
  <div class="actions">
    <p v-if="spliced" class="vods-muted spliced">
      This VOD was merged or split, so it no longer matches Twitch's VOD of the same id. Re-fetching from Twitch,
      downloading, re-uploading and deleting are off until that's undone (see Merge and split).
    </p>
    <div class="group">
      <div class="vods-eyebrow">Metadata</div>
      <div class="btns">
        <UiButton :disabled="spliced" :title="spliced ? TWITCH_OFF : undefined" :loading="busy === 'chapters'" @click="run('chapters', () => admin.refetchChapters(vod.id, forceChapters))">Re-fetch chapters from Twitch</UiButton>
        <UiCheckbox v-if="vod.chaptersLocked && !spliced" v-model="forceChapters" class="small">replace hand edits (locked)</UiCheckbox>
        <UiButton :disabled="spliced" :title="spliced ? TWITCH_OFF : undefined" :loading="busy === 'chat'" @click="run('chat', () => admin.saveChat(vod.id))">Save chat again</UiButton>
        <UiButton :disabled="spliced" :title="spliced ? TWITCH_OFF : 'Read this VOD’s chat from doomtp-bot’s log (the live recording)'" :loading="busy === 'botChat'" @click="run('botChat', () => admin.botChat(vod.id), () => emit('changed'))">Read bot chat</UiButton>
        <UiButton :disabled="spliced" :title="spliced ? TWITCH_OFF : undefined" :loading="busy === 'duration'" @click="run('duration', () => admin.refreshDuration(vod.id), () => emit('changed'))">Refresh duration</UiButton>
      </div>
    </div>
    <div class="group">
      <div class="vods-eyebrow">YouTube</div>
      <div class="btns">
        <UiSelect v-if="hasLive" v-model="descType" :options="TYPES" width="96px" />
        <UiButton :loading="busy === 'describe'" @click="run('describe', () => admin.updateDescriptions(vod.id, descType))">Update descriptions</UiButton>
        <UiButton :disabled="spliced" :title="spliced ? TWITCH_OFF : undefined" :loading="busy === 'reupload'" @click="ruOpen = true">Re-upload a part…</UiButton>
        <UiButton :disabled="spliced" :title="spliced ? TWITCH_OFF : undefined" :loading="busy === 'download'" @click="dlOpen = true">Download and upload again…</UiButton>
        <UiButton :disabled="spliced" :title="spliced ? TWITCH_OFF : 'Upload again with today’s settings and censor ranges, deleting the old uploads'" :loading="busy === 'rearchive'" @click="raOpen = true">Re-archive…</UiButton>
      </div>
    </div>
    <div class="group">
      <div class="vods-eyebrow">Danger</div>
      <div class="btns">
        <UiButton variant="danger" :disabled="spliced" :title="spliced ? TWITCH_OFF : undefined" :loading="busy === 'delete'" @click="delOpen = true">Delete from the archive…</UiButton>
      </div>
    </div>

    <UiDialog v-model:open="dlOpen" title="Download and upload again">
      Downloads the VOD again (while Twitch still has it), splits it and uploads the parts. Leave the range empty for every part.
      <div class="form">
        <UiField label="Source">
          <template #default="{ id }"><UiSelect :id="id" v-model="dlType" :options="TYPES" width="100%" /></template>
        </UiField>
        <div class="range">
          <UiField label="From part"><template #default="{ id }"><UiInput :id="id" v-model="dlStart" mono placeholder="1" /></template></UiField>
          <UiField label="To part"><template #default="{ id }"><UiInput :id="id" v-model="dlEnd" mono placeholder="last" /></template></UiField>
        </div>
      </div>
      <template #actions="{ close }">
        <UiButton @click="close">Cancel</UiButton>
        <UiButton variant="primary" :disabled="dlBad" @click="download">Start</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="ruOpen" title="Re-upload a part">
      Splits that part again from the saved video (or downloads it) and uploads it as a new YouTube video.
      <div class="form range">
        <UiField label="Source">
          <template #default="{ id }"><UiSelect :id="id" v-model="ruType" :options="TYPES" width="100%" /></template>
        </UiField>
        <UiField label="Part" :error="ruBad ? 'A whole number ≥ 1.' : undefined">
          <template #default="{ id }"><UiInput :id="id" v-model="ruPart" mono :invalid="ruBad" /></template>
        </UiField>
      </div>
      <template #actions="{ close }">
        <UiButton @click="close">Cancel</UiButton>
        <UiButton variant="primary" :disabled="ruBad" @click="reupload">Start</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="raOpen" title="Re-archive">
      Uploads the VOD again from the saved video (or downloads it while Twitch still has it), with today's settings
      <template v-if="censored">and its {{ censored }} censor {{ censored === 1 ? 'range' : 'ranges' }}</template><template v-else>(no censor ranges)</template>.
      Each old upload is deleted from YouTube once its replacement is up, so the VOD is never left without one; an old
      upload YouTube won't delete stays listed. Leave the part empty for the whole VOD.
      <div class="form range">
        <UiField label="Source">
          <template #default="{ id }"><UiSelect :id="id" v-model="raType" :options="TYPES" width="100%" /></template>
        </UiField>
        <UiField label="Part" :error="raBad ? 'A whole number ≥ 1, or empty.' : undefined">
          <template #default="{ id }"><UiInput :id="id" v-model="raPart" mono placeholder="all" :invalid="raBad" /></template>
        </UiField>
      </div>
      <p class="vods-muted small">{{ raOld ? `Replaces ${raOld} ${raOld === 1 ? 'upload' : 'uploads'}.` : 'Nothing to replace: uploads it as new.' }}</p>
      <template #actions="{ close }">
        <UiButton @click="close">Cancel</UiButton>
        <UiButton variant="primary" :disabled="raBad" @click="rearchive">Re-archive</UiButton>
      </template>
    </UiDialog>

    <UiConfirm
      v-model:open="delOpen"
      title="Delete this VOD from the archive?"
      tone="danger"
      confirm-label="Delete"
      cancel-label="Keep it"
      :confirm-text="vod.id"
      @confirm="remove"
    >
      Removes the VOD with its chat, emotes and game uploads from the archive and the site. The YouTube videos stay.
      This can't be undone.
    </UiConfirm>
  </div>
</template>

<style scoped>
.actions { display: flex; flex-direction: column; gap: 14px; }
.group { display: flex; flex-direction: column; gap: 6px; }
.btns { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.small { font-size: 12px; }
.spliced { margin: 0; font-size: 13px; max-width: 72ch; }
.form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; color: var(--vods-text, inherit); }
.range { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
</style>
