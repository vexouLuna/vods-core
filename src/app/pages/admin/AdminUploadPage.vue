<script setup lang="ts">
// /manage/upload: a video to YouTube with no Twitch VOD behind it. Pick a file and say what YouTube gets (title,
// description, privacy); it goes up in chunks with progress, and resumes after a dropped connection or a reload (pick the
// same file again). Then it is a hidden `upload-…` VOD whose job waits for review: censor it on its VOD page (the
// editor and preview), press Upload, and the YouTube link shows here. /manage/upload?vod=<id> follows one.
import { errorText, ProblemError } from '@vex/platform-web'
import type { JobOut } from '@vex/platform-web'
import type { Option } from '@vex/ui'
import { useToast } from '@vex/ui/utils'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AdminVod, CustomUpload, UploadPrivacy } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import { platform, vodSubject } from '../../admin/platform'
import { admin } from '../../admin/session'
import { resumable, sendFile } from '../../admin/upload'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const PRIVACY: Option<UploadPrivacy>[] = [
  { value: 'private', label: 'Private' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'public', label: 'Public' },
]
const TITLE_MAX = 100
const DESCRIPTION_MAX = 5000

const gib = (n: number) => (n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(2)} GiB` : `${(n / 2 ** 20).toFixed(1)} MiB`)

// ---- the file and the form ----
const file = ref<File | null>(null)
const title = ref('')
const description = ref('')
const privacy = ref<UploadPrivacy>('private')
const pending = ref<CustomUpload[]>([])
const up = ref<CustomUpload | null>(null)
const sent = ref(0)
const sending = ref(false)
const finishing = ref(false)
const error = ref<string | null>(null)
let ctrl: AbortController | null = null

async function loadPending() {
  try {
    pending.value = (await admin.uploads()).items
  } catch {
    pending.value = []
  }
}

function pick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0] ?? null
  input.value = ''
  if (!f) return
  file.value = f
  error.value = null
  if (!title.value.trim()) title.value = f.name.replace(/\.[^.]+$/, '').slice(0, TITLE_MAX)
  up.value = resumable(pending.value, f)
  sent.value = up.value?.received_bytes ?? 0
}

const titleError = computed(() =>
  !title.value.trim() ? 'A title is required.' : title.value.trim().length > TITLE_MAX ? `At most ${TITLE_MAX} characters.` : /[<>]/.test(title.value) ? 'YouTube refuses < and >.' : null,
)
const descriptionError = computed(() =>
  description.value.length > DESCRIPTION_MAX ? `At most ${DESCRIPTION_MAX} characters.` : /[<>]/.test(description.value) ? 'YouTube refuses < and >.' : null,
)
const ready = computed(() => !!file.value && !titleError.value && !descriptionError.value && !sending.value && !finishing.value)
const pct = computed(() => (file.value?.size ? Math.min(100, (100 * sent.value) / file.value.size) : 0))

async function start() {
  if (!file.value || !ready.value) return
  error.value = null
  sending.value = true
  ctrl = new AbortController()
  try {
    up.value ??= await admin.startUpload(file.value.name, file.value.size)
    const done = await sendFile(file.value, up.value, { signal: ctrl.signal, onProgress: (n) => (sent.value = n) })
    up.value = done
    finishing.value = true
    const made = await admin.finishUpload(done.id, { title: title.value.trim(), description: description.value.trim(), privacy: privacy.value })
    toast.show('Uploaded. Review it, then press Upload to send it to YouTube.', { duration: 6000 })
    file.value = null
    up.value = null
    await router.replace({ query: { vod: made.vod_id } })
  } catch (e) {
    if (ctrl?.signal.aborted) error.value = 'Paused. Pick Resume (or the same file again, after a reload) to go on.'
    else error.value = errorText(e)
    if (e instanceof ProblemError && e.code === 'upload_not_found') up.value = null
  } finally {
    sending.value = false
    finishing.value = false
    ctrl = null
    void loadPending()
  }
}
const pause = () => ctrl?.abort()
async function cancel(u: CustomUpload) {
  try {
    await admin.cancelUpload(u.id)
    if (up.value?.id === u.id) (up.value = null), (sent.value = 0)
    toast.show(`Cancelled ${u.filename}`, { duration: 3000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  }
  void loadPending()
}
// A tab closed mid-upload loses nothing on the server, but the browser asks first.
const beforeUnload = (e: BeforeUnloadEvent) => sending.value && e.preventDefault()

// ---- a finished upload: its VOD and job ----
const vodId = computed(() => (typeof route.query.vod === 'string' && route.query.vod.startsWith('upload-') ? route.query.vod : null))
const vod = ref<AdminVod | null>(null)
const job = ref<JobOut | null>(null)
const acting = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

async function follow() {
  const id = vodId.value
  if (!id) return
  try {
    const [v, runs] = await Promise.all([admin.vod(id), platform.jobs({ subject: vodSubject(id), limit: 5 })])
    vod.value = v
    job.value = runs.items.find((r) => r.kind === 'custom_upload') ?? runs.items[0] ?? null
  } catch (e) {
    error.value = errorText(e)
  }
}
const links = computed(() => (vod.value?.youtube ?? []).map((y) => ({ part: y.part, url: `https://youtu.be/${y.id}` })))
const stage = computed(() => {
  const j = job.value
  if (links.value.length && (!j || j.state === 'succeeded')) return 'done'
  if (!j) return 'loading'
  if (j.state === 'paused' && j.step === 'censor') return 'review'
  if (j.state === 'failed' || j.state === 'cancelled') return 'failed'
  if (j.state === 'succeeded') return 'done'
  return 'working'
})
async function publish() {
  if (!job.value) return
  acting.value = true
  try {
    job.value = await platform.resume(job.value.id)
    toast.show('Censoring, splitting and uploading to YouTube…', { duration: 4000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    acting.value = false
  }
}

watch(
  vodId,
  (id) => {
    if (timer) clearInterval(timer)
    vod.value = job.value = null
    if (id) {
      void follow()
      timer = setInterval(() => void follow(), 5000)
    }
  },
  { immediate: true },
)
onMounted(() => {
  void loadPending()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  ctrl?.abort()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <ManageShell title="Upload a video">
    <section v-if="vodId" class="vods-panel card">
      <h2 class="h">{{ vod?.title ?? vodId }}</h2>
      <p class="vods-muted vods-mono">{{ vodId }}<template v-if="vod"> · {{ vod.duration }}</template></p>
      <template v-if="stage === 'review'">
        <p>
          Uploaded to the archive and waiting for you. Set censor ranges on its
          <RouterLink :to="`/manage/vods/${vodId}`">VOD page</RouterLink> (the editor and the preview are there), then
          send it to YouTube.
        </p>
        <div class="row">
          <UiButton :to="`/manage/vods/${vodId}`">Review and censor</UiButton>
          <UiButton variant="primary" :disabled="acting" @click="publish">Upload to YouTube</UiButton>
        </div>
      </template>
      <template v-else-if="stage === 'working'">
        <p>
          {{ job?.state === 'paused' ? 'Paused' : job?.state === 'queued' ? 'Queued' : 'Working' }}<template v-if="job?.step">: {{ job.step }}</template>…
          <RouterLink v-if="job" :to="`/manage/jobs/${job.id}`">job {{ job.id }}</RouterLink>
        </p>
        <UiProgress :value="job ? Math.max(0, job.steps.indexOf(job.step ?? '')) : 0" :max="job?.steps.length ?? 1" label="Job progress" />
      </template>
      <template v-else-if="stage === 'failed'">
        <UiCallout tone="error" title="The upload job stopped">
          {{ job?.last_error || job?.state }}. <RouterLink v-if="job" :to="`/manage/jobs/${job.id}`">Open job {{ job.id }}</RouterLink> to retry it.
        </UiCallout>
      </template>
      <template v-else-if="stage === 'done'">
        <p v-if="links.length">On YouTube:</p>
        <ul v-if="links.length" class="links">
          <li v-for="l in links" :key="l.url"><a :href="l.url" target="_blank" rel="noopener">{{ l.url }}</a><span v-if="links.length > 1" class="vods-muted"> (part {{ l.part }})</span></li>
        </ul>
        <p v-else class="vods-muted">Done, but nothing went to YouTube (uploads off, or a dry run).</p>
      </template>
      <UiSkeleton v-else h="40px" />
      <div class="row"><UiButton variant="ghost" to="/manage/upload">Upload another</UiButton></div>
    </section>

    <template v-else>
      <section class="vods-panel card">
        <p class="vods-muted">
          A video that is not a Twitch VOD, straight to YouTube, through the censor step: pick the file and what YouTube
          shows, upload it here, censor it on its VOD page, then send it. It stays off this site.
        </p>
        <div class="row">
          <label class="pick">
            <UiButton :disabled="sending" tabindex="-1">{{ file ? 'Another file' : 'Choose a video' }}</UiButton>
            <input type="file" accept="video/*,.mkv,.mov,.mp4,.webm,.ts,.flv" class="file" :disabled="sending" aria-label="Choose a video" @change="pick" />
          </label>
          <span v-if="file" class="name">{{ file.name }} <span class="vods-muted">({{ gib(file.size) }})</span></span>
          <span v-else class="vods-muted">No file chosen.</span>
        </div>
        <UiCallout v-if="file && up && !sending && sent > 0" tone="info" title="Resuming">
          {{ gib(sent) }} of it is already on the server; it goes on from there.
        </UiCallout>
        <UiField label="Title" :error="(file && titleError) || undefined">
          <template #default="{ id }"><UiInput :id="id" v-model="title" :maxlength="TITLE_MAX" :disabled="sending" /></template>
        </UiField>
        <UiField label="Description" :error="descriptionError ?? undefined" help="What YouTube shows under the video.">
          <template #default="{ id }"><UiTextarea :id="id" v-model="description" :rows="4" :maxlength="DESCRIPTION_MAX" :disabled="sending" /></template>
        </UiField>
        <UiField label="Privacy">
          <UiSegmented v-model="privacy" :options="PRIVACY" label="Privacy" />
        </UiField>
        <div v-if="file" class="progress">
          <UiProgress :value="sent" :max="file.size" label="Upload progress" />
          <span class="vods-muted vods-mono">{{ pct.toFixed(1) }}% · {{ gib(sent) }} / {{ gib(file.size) }}</span>
        </div>
        <UiCallout v-if="error" tone="error" title="Not uploaded">{{ error }}</UiCallout>
        <div class="row">
          <UiButton v-if="sending" @click="pause">Pause</UiButton>
          <UiButton v-else variant="primary" :disabled="!ready" @click="start">{{ finishing ? 'Checking…' : up ? 'Resume' : 'Upload' }}</UiButton>
        </div>
      </section>

      <section v-if="pending.length" class="vods-panel card">
        <h2 class="h">Unfinished uploads</h2>
        <p class="vods-muted">Choose the same file again to resume one. They are deleted after a day without a chunk.</p>
        <ul class="pending">
          <li v-for="u in pending" :key="u.id">
            <span class="name">{{ u.filename }}</span>
            <span class="vods-muted">{{ gib(u.received_bytes) }} of {{ gib(u.size_bytes) }} · last chunk {{ new Date(u.updated_at).toLocaleString() }}</span>
            <UiButton size="sm" variant="ghost" :disabled="sending && up?.id === u.id" @click="cancel(u)">Cancel</UiButton>
          </li>
        </ul>
      </section>
    </template>
  </ManageShell>
</template>

<style scoped>
.card { display: grid; gap: 12px; padding: 16px; margin-bottom: 16px; }
.h { margin: 0; font-size: 1.05rem; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pick { position: relative; display: inline-flex; }
.file { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.name { overflow-wrap: anywhere; }
.progress { display: grid; gap: 4px; }
.links, .pending { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.pending li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
</style>
