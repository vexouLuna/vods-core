<script setup lang="ts">
// /manage/synthetic/new and /manage/synthetic/:id: a VOD made of windows of real ones (GET/POST/PUT/DELETE
// /api/v2/synthetic): a merge, a split, a playthrough (built from a game's windows and tagged `playthroughs`) or
// anything else; they all work the same (ADR 0005 in twitch-archive). Its sources can be hidden or shown in one go (a
// hidden one a shown synthetic VOD plays still opens: its link leads here). Compile starts a job that
// joins its windows into one file and uploads it as type `compiled` (the archive's compile_youtube_upload must be on).
// An existing one has the same header panel as /manage/vods/:id (title, visibility, tags, cut reason), its thumbnail,
// and the Actions and Jobs panels; the segments' Save sends only the segments.
import { useToast } from '@vex/ui/utils'
import { timeAgo } from '../../lib/time'
import { toClock } from '../../../index'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { errorText } from '@vex/platform-web'
import { JobsTable, usePoll } from '@vex/platform-web/vue'
import type { AdminVod, PlaythroughWindow, SyntheticDmca, SyntheticInput, SyntheticVod } from '../../admin/api'
import DetailsEditor from '../../admin/DetailsEditor.vue'
import ManageShell from '../../admin/ManageShell.vue'
import PlaythroughBuilder from '../../admin/PlaythroughBuilder.vue'
import { admin } from '../../admin/session'
import { platform, vodSubject } from '../../admin/platform'
import TimeInput from '../../admin/TimeInput.vue'
import VodActions from '../../admin/VodActions.vue'
import VodHeaderPanel from '../../admin/VodHeaderPanel.vue'
import { isAutoTag, tagConfig, VODS_TAG } from '../../lib/vodTags'
import { site } from '../../site'
import { moved } from '../../lib/reorder'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const toast = useToast()
const isNew = computed(() => !props.id)

interface Row { key: number; vod_id: string; start: number | null; end: number | null; at: number | null; label: string }
let keys = 0
const row = (s: Partial<Row> = {}): Row => ({ key: keys++, vod_id: '', start: null, end: null, at: null, label: '', ...s })

const vod = ref<SyntheticVod | null>(null)
const loadError = ref<string | null>(null)
const notFound = ref(false)
// The new one's id, title and tags; an existing one's title and tags are in the header panel (`full`).
const form = ref({ id: '', title: '', tags: [] as string[] })
/** The VOD as /manage/vods/:id has it (GET /admin/vods/:id), for the header panel, thumbnail and actions. */
const full = ref<AdminVod | null>(null)
const header = ref<InstanceType<typeof VodHeaderPanel> | null>(null)
const segments = ref<Row[]>([])
// The game a playthrough follows (the archive keeps its segments to that game's windows), or the one it was just built from.
const follow = ref<{ id: string; name: string | null } | null>(null)
const keepUp = ref(false)

function fill(v: SyntheticVod | null) {
  vod.value = v
  form.value = { id: v?.id ?? '', title: v?.title ?? '', tags: v?.tags ?? [] }
  // A playthrough's segments play back to back: its saved `at`s are dropped, or after any edit to a window they would
  // leave gaps ("Technical difficulties"). A merge or split (tagged `vods`) keeps them: its gap is where the stream was
  // down (an older archive's `supersedes` says the same).
  const keepAt = !!v && (v.tags.includes(VODS_TAG) || v.supersedes)
  segments.value = (v?.segments ?? []).map((s) =>
    row({ vod_id: s.vod_id, start: s.start, end: s.end, at: keepAt ? s.at : null, label: s.label ?? '' }),
  )
  if (!segments.value.length) segments.value = [row()]
  follow.value = v?.auto ? { id: v.auto.game_id, name: null } : null
  keepUp.value = !!v?.auto
}
async function load() {
  loadError.value = null
  notFound.value = false
  if (!props.id) return fill(null)
  vod.value = null
  full.value = null
  try {
    const [v, f] = await Promise.all([admin.synthetic(props.id), admin.vod(props.id)])
    fill(v)
    full.value = f
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound.value = true
    else loadError.value = errorText(e)
  }
}
watch(() => props.id, load, { immediate: true })
const reloadFull = async () => (full.value = await admin.vod(props.id!).catch(() => full.value))

// Its jobs refresh on their own (none for a new one).
const { data: jobPage, refresh: refreshJobs } = usePoll(
  (signal) => (props.id ? platform.jobs({ subject: vodSubject(props.id), limit: 20 }, signal) : Promise.resolve(null)),
  5_000,
)
const jobs = computed(() => jobPage.value?.items ?? [])
const activeJobs = computed(() => jobs.value.filter((j) => j.state === 'running' || j.state === 'queued' || j.state === 'paused').length)

// ── its sources: hidden or shown together ──
const sources = computed(() => [...new Set((vod.value?.segments ?? []).map((s) => s.vod_id))])
/** Which sources are hidden; null while loading. */
const hiddenSources = ref<Set<string> | null>(null)
const sourcesBusy = ref(false)
async function loadSources() {
  const ids = sources.value
  const states = await Promise.all(ids.map((id) => admin.vod(id).then((v) => (v.hidden ? id : null), () => null)))
  if (ids === sources.value) hiddenSources.value = new Set(states.filter((id): id is string => !!id))
}
watch(sources, () => ((hiddenSources.value = null), void loadSources()), { immediate: true })
async function setSources(hide: boolean) {
  sourcesBusy.value = true
  try {
    for (const id of sources.value) if (hiddenSources.value?.has(id) !== hide) await admin.patchVod(id, { hidden: hide })
    toast.show(hide ? `Hid ${sources.value.length} sources` : `Showed ${sources.value.length} sources`, { duration: 3000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    sourcesBusy.value = false
    void loadSources()
  }
}

// ── segments ──
const move = (i: number, by: -1 | 1) => (segments.value = moved(segments.value, i, by))
const remove = (i: number) => (segments.value = segments.value.filter((_, j) => j !== i))
const addRow = () => (segments.value = [...segments.value, row()])
function addWindows(windows: PlaythroughWindow[], game: string | null, gameId: string | null) {
  if (gameId) follow.value = { id: gameId, name: game }
  const kept = segments.value.filter((s) => s.vod_id.trim())
  segments.value = [...kept, ...windows.map((w) => row({ vod_id: w.segment.vod_id, start: w.segment.start, end: w.segment.end, label: w.segment.label }))]
  // A playthrough is tagged so (by hand: any tag can be taken off); an existing one's go to its header panel's draft.
  const title = game ? `${game} playthrough` : undefined
  if (header.value) header.value.suggest({ tag: 'playthroughs', title })
  else {
    if (!form.value.tags.includes('playthroughs')) form.value.tags = [...form.value.tags, 'playthroughs']
    if (!form.value.title.trim() && title) form.value.title = title
  }
  builderOpen.value = false
}
const builderOpen = ref(false)

// ── checks ──
/** The site's tags, for a new one (the automatic ones are set by the archive). */
const tagOptions = computed(() => Object.keys(tagConfig.value).filter((t) => !isAutoTag(t)).map((value) => ({ value, color: tagConfig.value[value]?.color })))
const newLocked = [{ value: 'synthetic', tone: 'accent' as const, title: 'Made of windows of other VODs' }]
const idError = computed(() => {
  if (!isNew.value) return null
  const id = form.value.id.trim()
  if (!id) return 'Give it an id.'
  if (/^\d+$/.test(id)) return "Not only digits: those are Twitch's VOD ids."
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return 'Letters, digits, - and _ only.'
  return null
})
const segError = (s: Row) =>
  !/^\d+$/.test(s.vod_id.trim()) ? 'A Twitch VOD id.' : s.start != null && s.end != null && s.end <= s.start ? 'The end must come after the start.' : null
const segErrors = computed(() => segments.value.map(segError))
const valid = computed(() => !idError.value && segments.value.length > 0 && segErrors.value.every((e) => !e))
const total = computed(() =>
  segments.value.every((s) => s.start != null && s.end != null) ? segments.value.reduce((n, s) => n + (s.end! - s.start!), 0) : null,
)

// ── save / delete ──
const saving = ref(false)
const saveError = ref<string | null>(null)
async function save() {
  if (!valid.value) return
  saving.value = true
  saveError.value = null
  const body: SyntheticInput = {
    segments: segments.value.map((s) => ({
      vod_id: s.vod_id.trim(),
      ...(s.start != null ? { start: s.start } : {}),
      ...(s.end != null ? { end: s.end } : {}),
      ...(s.at != null ? { at: s.at } : {}),
      ...(s.label.trim() ? { label: s.label.trim() } : {}),
    })),
  }
  // Following a game, the archive makes the segments (it ignores these); without, they are a hand edit, which stops it.
  if (keepUp.value && follow.value) body.auto = { game_id: follow.value.id }
  try {
    if (isNew.value) {
      const made = await admin.createSynthetic({ ...body, id: form.value.id.trim(), title: form.value.title.trim() || null, tags: form.value.tags })
      toast.show(`Made ${made.id}`)
      router.replace(`/manage/synthetic/${encodeURIComponent(made.id)}`)
    } else {
      fill(await admin.updateSynthetic(props.id!, body))
      void reloadFull()
      toast.show('Segments saved')
    }
  } catch (e) {
    saveError.value = errorText(e)
  } finally {
    saving.value = false
  }
}

const compiling = ref(false)
/** The sources' DMCA claims, when Compile found some: the warning is open until it's accepted or cancelled. */
const claims = ref<SyntheticDmca | null>(null)
const accepted = ref(false)
const claimsOpen = computed({ get: () => claims.value !== null, set: (open) => { if (!open) claims.value = null } })
const ranges = (r: [number, number][]) => r.map(([a, b]) => `${toClock(a)}–${toClock(b)}`).join(', ')
async function compile() {
  compiling.value = true
  try {
    const found = await admin.syntheticDmca(props.id!)
    // Any claim warns, also one outside the windows it plays.
    if (found.overlapping.length || found.other.length) {
      accepted.value = false
      claims.value = found
    } else await enqueueCompile(false)
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    compiling.value = false
  }
}
async function enqueueCompile(acceptDmca: boolean) {
  compiling.value = true
  try {
    // `replace` swaps out the compiled uploads of an earlier run (none on the first); the archive refuses
    // sources with DMCA claims unless `accept_dmca`.
    const payload = { type: 'compiled', replace: true, ...(acceptDmca ? { accept_dmca: true } : {}) }
    const job = await platform.enqueue({ kind: 'compile', subject: vodSubject(props.id!), payload })
    claims.value = null
    router.push(`/manage/jobs/${job.id}`)
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    compiling.value = false
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)
async function destroy() {
  deleting.value = true
  try {
    await admin.deleteSynthetic(props.id!)
    toast.show(`Deleted ${props.id}`)
    router.push('/manage/vods?synthetic=true')
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    deleting.value = false
    deleteOpen.value = false
  }
}

const when = (at: string | null) => (at ? new Date(at).toLocaleString() : '—')
watchEffect(() => (document.title = `${props.id ?? 'New synthetic VOD'} · Manage · ${site.name}`))
</script>

<template>
  <ManageShell :title="isNew ? 'New synthetic VOD' : `Synthetic VOD ${id}`">
    <template #actions>
      <UiButton v-if="!isNew" :to="`/vods/${encodeURIComponent(id!)}`">Watch page</UiButton>
      <UiButton v-if="!isNew" :loading="compiling" title="Join its windows into one file and upload it" @click="compile">{{ vod?.compiled ? 'Recompile' : 'Compile' }}</UiButton>
      <UiButton v-if="!isNew" variant="danger" @click="deleteOpen = true">Delete</UiButton>
    </template>
    <p class="back"><RouterLink to="/manage/vods?synthetic=true">← Synthetic VODs</RouterLink></p>

    <UiCallout v-if="notFound" tone="warn" title="No such synthetic VOD">The archive has no synthetic VOD {{ id }}.</UiCallout>
    <UiLoadState
      v-else
      :error="loadError"
      :loading="!isNew && !vod"
      error-title="Couldn't load it"
      @retry="load"
    >
      <template #loading>
        <UiSkeleton h="90px" />
        <UiSkeleton h="200px" />
      </template>
      <template v-if="full && vod">
        <VodHeaderPanel ref="header" :vod="full" @saved="(v) => (full = v)">
          <dl class="vods-facts">
            <div><dt>Length</dt><dd class="vods-mono">{{ vod.duration ?? '—' }}</dd></div>
            <div><dt>Streamed</dt><dd>{{ when(vod.created_at) }}</dd></div>
            <div><dt>Made</dt><dd :title="when(vod.made_at)">{{ vod.made_at ? timeAgo(vod.made_at) : '—' }}</dd></div>
            <div><dt>Changed</dt><dd :title="when(vod.changed_at)">{{ vod.changed_at ? timeAgo(vod.changed_at) : '—' }}</dd></div>
            <div v-if="vod.compiled"><dt>Compiled</dt><dd><UiChip :tone="vod.compiled.outdated ? 'warn' : 'ok'">{{ vod.compiled.outdated ? 'outdated: the segments changed' : 'up to date' }}</UiChip></dd></div>
          </dl>
          <div v-if="sources.length" class="srcs">
            <span class="small">
              Sources:
              <template v-if="hiddenSources">{{ hiddenSources.size }} of {{ sources.length }} hidden</template>
              <template v-else>{{ sources.length }}</template>
            </span>
            <UiButton size="sm" :loading="sourcesBusy" :disabled="!hiddenSources || hiddenSources.size === sources.length" title="They leave the lists; their links lead here" @click="setSources(true)">Hide all sources</UiButton>
            <UiButton size="sm" :loading="sourcesBusy" :disabled="!hiddenSources || hiddenSources.size === 0" @click="setSources(false)">Show all sources</UiButton>
          </div>
        </VodHeaderPanel>

        <section class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow sec">Details</h2>
          <DetailsEditor :vod="full" @saved="(v) => (full = v)" />
        </section>
      </template>

      <form @submit.prevent="save">
        <section v-if="isNew" class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow sec">Details</h2>
          <div class="fields">
            <UiField label="Id" :error="form.id && idError ? idError : undefined" help="In its link: /vods/<id>. Can't change later.">
              <template #default="{ id: fid }"><UiInput :id="fid" v-model="form.id" mono placeholder="elden-ring" /></template>
            </UiField>
            <UiField label="Title" help="Empty: the first source's.">
              <template #default="{ id: fid }"><UiInput :id="fid" v-model="form.title" /></template>
            </UiField>
          </div>
          <UiField label="Tags" help="vods lists it on /vods, playthroughs on Playthroughs. compilation is set while it keeps up to date.">
            <template #default="{ id: fid }"><UiTagInput :id="fid" v-model="form.tags" :options="tagOptions" :locked="newLocked" placeholder="add a tag…" /></template>
          </UiField>
        </section>

        <section class="panel vods-panel vx-glass-rim">
          <div class="head">
            <h2 class="vods-eyebrow sec">Segments</h2>
            <span class="vods-muted small">{{ segments.length }} · {{ total == null ? 'some run to their source’s end' : toClock(total) }}</span>
            <UiButton size="sm" class="push" @click="builderOpen = !builderOpen">{{ builderOpen ? 'Close builder' : 'Build a playthrough…' }}</UiButton>
          </div>
          <div v-if="builderOpen" class="builder"><PlaythroughBuilder @add="addWindows" /></div>
          <UiCheckbox
            v-if="follow"
            v-model="keepUp"
            :label="`Keep up to date: every window of ${follow.name ?? `game ${follow.id}`}, new streams included (the segments below then aren't saved)`"
          />
          <p class="vods-muted small">
            Each is a window of a Twitch VOD, played one after another. Empty start or end: the source's own; empty
            “at”: right after the one before.
          </p>
          <ol class="segs">
            <li v-for="(s, i) in segments" :key="s.key" class="seg">
              <span class="n vods-mono">{{ i + 1 }}</span>
              <UiField label="VOD" :error="s.vod_id && segErrors[i] ? segErrors[i]! : undefined">
                <template #default="{ id: fid }"><UiInput :id="fid" v-model="s.vod_id" mono placeholder="2200000000" class="vodid" /></template>
              </UiField>
              <UiField label="Start"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.start" optional placeholder="start" /></template></UiField>
              <UiField label="End"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.end" optional placeholder="end" /></template></UiField>
              <UiField label="At"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.at" optional placeholder="next" /></template></UiField>
              <UiField label="Label" class="grow">
                <template #default="{ id: fid }"><UiInput :id="fid" v-model="s.label" placeholder="Part 1" /></template>
              </UiField>
              <span class="acts">
                <UiButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move segment ${i + 1} up`" @click="move(i, -1)">↑</UiButton>
                <UiButton size="sm" variant="ghost" :disabled="i === segments.length - 1" :aria-label="`Move segment ${i + 1} down`" @click="move(i, 1)">↓</UiButton>
                <UiButton size="sm" variant="ghost" :aria-label="`Remove segment ${i + 1}`" @click="remove(i)">✕</UiButton>
              </span>
            </li>
          </ol>
          <UiButton size="sm" @click="addRow">Add a segment</UiButton>
        </section>

        <UiCallout v-if="saveError" tone="error" title="Couldn't save">{{ saveError }}</UiCallout>
        <div class="save">
          <UiButton type="submit" variant="primary" :loading="saving" :disabled="!valid">{{ isNew ? 'Make it' : 'Save segments' }}</UiButton>
          <UiButton v-if="!isNew" :disabled="saving" @click="fill(vod)">Undo changes</UiButton>
        </div>
      </form>

      <template v-if="full">
        <section class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow sec">Actions</h2>
          <VodActions :vod="full" @job="refreshJobs" @changed="reloadFull" @deleted="router.push('/manage/vods?synthetic=true')" />
        </section>
        <section class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow sec">Jobs <span v-if="activeJobs" class="vods-muted">· {{ activeJobs }} active</span></h2>
          <JobsTable :jobs="jobs" empty="No jobs for this VOD." label="This VOD's jobs" />
        </section>
      </template>
    </UiLoadState>

    <UiDialog v-model:open="claimsOpen" title="Its sources have DMCA claims">
      <UiCallout tone="error" title="The compiled file copies the claimed content">
        These sources were claimed on YouTube. Their claimed ranges go into the compiled upload as they are, and it
        can be claimed, blocked or get the channel a strike.
      </UiCallout>
      <p class="small"><strong>In the windows this video uses</strong></p>
      <ul v-if="claims?.overlapping.length" class="claims">
        <li v-for="(c, i) in claims.overlapping" :key="i">
          <strong>VOD {{ c.vod_id }}</strong>{{ c.part !== null ? `, part ${c.part}` : '' }}:
          <span v-if="c.mute.length">muted {{ ranges(c.mute) }}</span><span v-if="c.mute.length && c.blackout.length">; </span>
          <span v-if="c.blackout.length">blacked out {{ ranges(c.blackout) }}</span>
          <span v-if="!c.placed" class="vods-muted"> (a live copy's times: couldn't be matched to the windows)</span>
        </li>
      </ul>
      <p v-else class="small vods-muted">None: every claim is outside the windows used.</p>
      <details v-if="claims?.other.length" class="other">
        <summary>Other claims in stitched videos ({{ claims.other.length }})</summary>
        <ul class="claims">
          <li v-for="(c, i) in claims.other" :key="i">
            <strong>VOD {{ c.vod_id }}</strong>{{ c.part !== null ? `, part ${c.part}` : '' }}:
            <span v-if="c.mute.length">muted {{ ranges(c.mute) }}</span><span v-if="c.mute.length && c.blackout.length">; </span>
            <span v-if="c.blackout.length">blacked out {{ ranges(c.blackout) }}</span>
          </li>
        </ul>
      </details>
      <UiCheckbox v-model="accepted" label="I understand the risks" />
      <template #actions="{ close }">
        <UiButton @click="close">Cancel</UiButton>
        <UiButton variant="danger-solid" :disabled="!accepted" :loading="compiling" @click="enqueueCompile(true)">Compile anyway</UiButton>
      </template>
    </UiDialog>

    <UiConfirm v-model:open="deleteOpen" :title="`Delete ${id}?`" tone="danger" confirm-label="Delete" :loading="deleting" @confirm="destroy">
      Its link stops working. VODs its merge or split hid are shown again; other hidden sources stay hidden.
    </UiConfirm>
  </ManageShell>
</template>

<style scoped>
a { color: inherit; }
.back { margin: -8px 0 16px; font-size: 13px; }
.panel { padding: 14px 16px; margin-bottom: 16px; }
.sec { margin: 0 0 8px; }
.small { font-size: 13px; margin: 8px 0; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 4px 12px; margin-bottom: 8px; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.head .sec { margin: 0; }
.push { margin-left: auto; }
.builder { margin: 10px 0; padding: 12px; border: 1px solid var(--vods-line); border-radius: var(--vods-radius, 8px); }
.segs { list-style: none; margin: 8px 0 12px; padding: 0; display: grid; gap: 8px; }
.seg { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 10px; padding-top: 8px; border-top: 1px solid var(--vods-line); }
.seg > * { margin: 0; }
.n { align-self: center; min-width: 1.5em; opacity: 0.6; }
.vodid { width: 9.5rem; }
.grow { flex: 1 1 10rem; }
.claims { margin: 8px 0 12px; padding-left: 1.2em; display: grid; gap: 4px; }
.other { margin-bottom: 12px; }
.other summary { cursor: pointer; }
.acts { display: flex; gap: 2px; }
.save { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.srcs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
</style>
