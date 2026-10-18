<script setup lang="ts">
// Start any job kind the worker knows (GET /api/v2/job-kinds): pick the kind, the VOD, where to start and where to
// pause. Queued with POST /api/v2/jobs, the VOD as its `vod:<id>` subject.
import type { Option } from '@vex/ui'
import { computed, ref, watch } from 'vue'
import { ProblemError, errorText, type JobKindOut } from '@vex/platform-web'
import { platform, vodSubject } from './platform'

const props = defineProps<{ kinds: JobKindOut[]; vodId?: string }>()
const emit = defineEmits<{ started: [jobId: number] }>()
const open = defineModel<boolean>('open', { default: false })

const kind = ref('archive')
const vodId = ref('')
const fromStep = ref('')
const pauseBefore = ref<string[]>([])
const paused = ref(false)
const payload = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
// A VOD the archive doesn't have yet: jobs need its row, which VODs → Add from Twitch makes.
const missingVod = ref<string | null>(null)

const kindOptions = computed<Option<string>[]>(() =>
  props.kinds.map((k) => ({ value: k.name, label: k.name, sub: k.description || `${k.steps.length} steps` })),
)
const kindInfo = computed(() => props.kinds.find((k) => k.name === kind.value))
const steps = computed(() => kindInfo.value?.steps ?? [])
const stepOptions = computed<Option<string>[]>(() => [{ value: '', label: 'First step' }, ...steps.value.map((s) => ({ value: s, label: s }))])

// Immediate: the page can load with the dialog already open (?new=1).
watch(
  open,
  (v) => {
    if (!v) return
    error.value = null
    missingVod.value = null
    vodId.value = props.vodId ?? ''
  },
  { immediate: true },
)
watch(
  [kind, () => props.kinds],
  () => {
    // The kinds can arrive after the dialog opened.
    if (!kindInfo.value && props.kinds.length) kind.value = props.kinds[0]!.name
    fromStep.value = ''
    pauseBefore.value = [...(kindInfo.value?.pause_before ?? [])]
  },
  { immediate: true },
)

const customPauses = computed(() => {
  const own = [...pauseBefore.value].sort().join()
  return own !== [...(kindInfo.value?.pause_before ?? [])].sort().join()
})

function togglePause(step: string, on: boolean) {
  pauseBefore.value = on ? [...pauseBefore.value, step] : pauseBefore.value.filter((s) => s !== step)
}

const payloadError = computed(() => {
  if (!payload.value.trim()) return null
  try {
    const v: unknown = JSON.parse(payload.value)
    return v && typeof v === 'object' && !Array.isArray(v) ? null : 'Must be a JSON object.'
  } catch {
    return 'Not valid JSON.'
  }
})

async function submit() {
  if (!kind.value || payloadError.value) return
  busy.value = true
  error.value = null
  missingVod.value = null
  try {
    const job = await platform.enqueue({
      kind: kind.value,
      subject: vodId.value.trim() ? vodSubject(vodId.value.trim()) : undefined,
      payload: payload.value.trim() ? JSON.parse(payload.value) : undefined,
      step: fromStep.value || undefined,
      // Only when it differs from the kind's, so the run keeps following the kind's gates.
      pause_before: customPauses.value ? pauseBefore.value : undefined,
      paused: paused.value,
    })
    emit('started', job.id)
  } catch (e) {
    if (e instanceof ProblemError && e.code === 'vod_not_found') missingVod.value = vodId.value.trim()
    else error.value = errorText(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiDialog v-model:open="open" title="Start a job" width="480px">
    <form id="start-job" class="form" @submit.prevent="submit">
      <UiCallout v-if="!kindOptions.length" tone="warn">Couldn't load the job kinds from the worker.</UiCallout>
      <div class="row">
        <UiField label="Kind">
          <template #default="{ id }"><UiSelect :id="id" v-model="kind" :options="kindOptions" width="100%" /></template>
        </UiField>
        <UiField label="VOD id" help="Empty for jobs that aren't about one VOD.">
          <template #default="{ id }"><UiInput :id="id" v-model="vodId" mono placeholder="2345678901" /></template>
        </UiField>
      </div>
      <UiField label="Start at">
        <template #default="{ id }"><UiSelect :id="id" v-model="fromStep" :options="stepOptions" width="100%" /></template>
      </UiField>
      <fieldset v-if="steps.length" class="steps">
        <legend class="vods-eyebrow">Pause before</legend>
        <UiCheckbox v-for="s in steps" :key="s" :model-value="pauseBefore.includes(s)" @update:model-value="togglePause(s, $event)">
          <span class="vods-mono">{{ s }}</span>
        </UiCheckbox>
      </fieldset>
      <UiCheckbox v-model="paused">Create it paused (resume it by hand)</UiCheckbox>
      <UiField label="Payload (JSON, optional)" :error="payloadError ?? undefined">
        <template #default="{ id }">
          <textarea :id="id" v-model="payload" class="vods-input vods-mono payload" rows="3" placeholder='{"force": true}' />
        </template>
      </UiField>
      <UiCallout v-if="missingVod" tone="warn">
        VOD {{ missingVod }} isn't in the archive yet. Add it from Twitch first: that archives it, or with
        “Details only”, adds it for jobs like this one.
        <template #actions><UiButton size="sm" :to="`/manage/vods?add=${missingVod}`">Add from Twitch</UiButton></template>
      </UiCallout>
      <UiCallout v-if="error" tone="error">{{ error }}</UiCallout>
    </form>
    <template #actions="{ close }">
      <UiButton @click="close">Cancel</UiButton>
      <UiButton type="submit" form="start-job" variant="primary" :loading="busy" :disabled="!kind || !!payloadError">Start</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; color: var(--vods-text, inherit); }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.steps { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; }
.steps legend { margin-bottom: 6px; padding: 0; }
.payload { width: 100%; box-sizing: border-box; height: auto; resize: vertical; padding: 6px 8px; }
</style>
