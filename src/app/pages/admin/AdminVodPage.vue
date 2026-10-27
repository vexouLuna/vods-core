<script setup lang="ts">
// /manage/vods/:id: fix one VOD by hand (the header panel shared with /manage/synthetic/:id, details, chapters, games,
// YouTube and Drive lists, censor ranges, emotes) and run its jobs. The Timeline workbench keeps the preview (its server
// file or its uploads) in view beside the chapters, games and censor editors, which set times from it and draw censor
// boxes on it.
import { timeAgo } from '../../lib/time'
import { toClock } from '../../../index'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Option } from '@vex/ui'
import { useRoute, useRouter } from 'vue-router'
import { isSpliced, type AdminVod } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import CensorEditor from '../../admin/CensorEditor.vue'
import ChaptersEditor from '../../admin/ChaptersEditor.vue'
import DetailsEditor from '../../admin/DetailsEditor.vue'
import DriveEditor from '../../admin/DriveEditor.vue'
import { vodSeconds } from '../../admin/edits'
import EmotesPanel from '../../admin/EmotesPanel.vue'
import MediaPreview from '../../admin/preview/MediaPreview.vue'
import { providePreview } from '../../admin/preview/previewState'
import SplicePanel from '../../admin/SplicePanel.vue'
import { errorText, stamp } from '@vex/platform-web'
import { JobsTable, usePoll } from '@vex/platform-web/vue'
import { admin } from '../../admin/session'
import { platform, vodSubject } from '../../admin/platform'
import VodActions from '../../admin/VodActions.vue'
import VodHeaderPanel from '../../admin/VodHeaderPanel.vue'
import YoutubeEditor from '../../admin/YoutubeEditor.vue'
import { site } from '../../site'

const props = defineProps<{ id: string }>()
const router = useRouter()
const route = useRoute()
const preview = providePreview()

const vod = ref<AdminVod | null>(null)
const loadError = ref<string | null>(null)
const notFound = ref(false)

async function load() {
  loadError.value = null
  notFound.value = false
  try {
    vod.value = await admin.vod(props.id)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 404) notFound.value = true
    else loadError.value = errorText(e)
  }
}
watch(() => props.id, load, { immediate: true })

// The VOD's jobs refresh on their own; the VOD itself only reloads after an edit, so open forms keep their drafts.
const { data: jobPage, refresh: refreshJobs } = usePoll((signal) => platform.jobs({ subject: vodSubject(props.id), limit: 20 }, signal), 5_000)
const jobs = computed(() => jobPage.value?.items ?? [])
const activeJobs = computed(() => jobs.value.filter((j) => j.state === 'running' || j.state === 'queued' || j.state === 'paused').length)

/** The spans doomtp-bot wasn't listening, as text. */
const botGaps = computed(() =>
  (vod.value?.botChat?.coverage?.gaps ?? []).map(
    (g) => `${stamp(new Date(g.from).toISOString())} → ${stamp(new Date(g.to).toISOString())}${g.reason ? ` (${g.reason})` : ''}`,
  ),
)
const duration = computed(() => (vod.value ? vodSeconds(vod.value) : 0))

// The Timeline workbench's tabs. A link to #censor (the censor review) opens that tab.
type TimelineTab = 'chapters' | 'censor'
const tab = ref<TimelineTab>(route.hash === '#censor' ? 'censor' : 'chapters')
// Each editor's row count and whether it has unsaved changes. `saved` is the count while it was last clean, so a
// draft reads "Chapters 12 → 13 •".
const drafts = ref<Partial<Record<TimelineTab, { saved: number; rows: number; dirty: boolean }>>>({})
function draft(t: TimelineTab, rows: number, dirty: boolean) {
  drafts.value[t] = { saved: dirty ? (drafts.value[t]?.saved ?? rows) : rows, rows, dirty }
}
// Phones (the workbench's one-column layout) get the compact "7→6•", so two drafts still fit the tab strip.
const narrow = ref(false)
let wide: MediaQueryList | undefined
const measure = () => (narrow.value = !wide?.matches)
onMounted(() => {
  wide = matchMedia('(min-width: 960px)')
  measure()
  wide.addEventListener('change', measure)
})
onBeforeUnmount(() => wide?.removeEventListener('change', measure))
const tabs = computed<Option<TimelineTab>[]>(() =>
  (
    [
      ['chapters', 'Chapters'],
      ['censor', 'Censor'],
    ] as const
  ).map(([value, label]) => {
    const d = drafts.value[value]
    if (!d) return { value, label }
    if (!d.dirty) return { value, label: `${label} ${d.rows}` }
    const sp = narrow.value ? '' : ' '
    return { value, label: `${label} ${d.saved === d.rows ? d.rows : `${d.saved}${sp}→${sp}${d.rows}`}${sp}•` }
  }),
)
// The router doesn't scroll to a hash: a link to #censor lands on the Timeline panel once the VOD has loaded.
watch(
  vod,
  async () => {
    if (route.hash !== '#censor') return
    await nextTick()
    document.getElementById('timeline')?.scrollIntoView({ block: 'start' })
  },
  { once: true },
)

// The censor box being edited is only drawn while its editor is showing.
watch(tab, (t) => t !== 'censor' && (preview.selected.value = null))

function saved(v: AdminVod) {
  vod.value = v
}
function jobStarted() {
  refreshJobs()
}
function deleted() {
  router.replace('/manage/vods')
}

watch(vod, (v) => (document.title = `${v?.title ?? props.id} · Manage · ${site.name}`))
onMounted(() => (document.title = `VOD ${props.id} · Manage · ${site.name}`))
</script>

<template>
  <ManageShell :title="`VOD ${id}`">
    <template #actions>
      <UiButton :to="`/vods/${id}`">Watch page</UiButton>
      <UiButton :to="`/manage/jobs?subject=${encodeURIComponent(vodSubject(id))}`">All its jobs</UiButton>
    </template>
    <p class="back"><RouterLink to="/manage/vods">← VODs</RouterLink></p>

    <UiCallout v-if="notFound" tone="warn" title="No such VOD">The archive has no VOD {{ id }}.</UiCallout>
    <UiLoadState
      v-else
      :error="loadError"
      :loading="!vod"
      error-title="Couldn't load this VOD"
      @retry="load"
    >
      <template #loading>
        <UiSkeleton h="90px" />
        <UiSkeleton h="200px" />
      </template>
      <template v-if="vod">
        <UiCallout v-if="vod.hidden" tone="warn" title="Hidden">
          This VOD is gone from the public site: the list, its watch page, the games pages and its chat. It's still here.
        </UiCallout>

        <UiCallout v-if="vod.synthetic" tone="info" title="A synthetic VOD">
          It's made of windows of other VODs{{ vod.synthetic.supersedes ? ', and stands in for them' : '' }}. Its segments
          and thumbnail are edited on its own page.
          <template #actions><UiButton size="sm" :to="`/manage/synthetic/${encodeURIComponent(id)}`">Edit its segments</UiButton></template>
        </UiCallout>

        <VodHeaderPanel :vod="vod" @saved="saved">
          <dl class="vods-facts">
            <div><dt>Id</dt><dd class="vods-mono">{{ vod.id }}</dd></div>
            <div><dt>Streamed</dt><dd :title="stamp(vod.createdAt)">{{ new Date(vod.createdAt).toLocaleString() }}</dd></div>
            <div><dt>Duration</dt><dd class="vods-mono">{{ toClock(duration) }}</dd></div>
            <div v-if="vod.merged_into"><dt>Merged into</dt><dd class="vods-mono"><RouterLink :to="`/manage/vods/${vod.merged_into.id}`">{{ vod.merged_into.id }}</RouterLink> at {{ toClock(vod.merged_into.offset) }}</dd></div>
            <div v-if="vod.stream_id"><dt>Stream</dt><dd class="vods-mono">{{ vod.stream_id }}</dd></div>
            <div><dt>Parts</dt><dd>{{ vod.youtube?.length ?? 0 }} YouTube · {{ vod.drive?.length ?? 0 }} Drive</dd></div>
            <div><dt>Chapters</dt><dd>{{ vod.chapters?.length ?? 0 }} <UiChip v-if="vod.chaptersLocked" tone="warn">locked</UiChip></dd></div>
            <div>
              <dt>Bot chat</dt>
              <dd v-if="vod.botChat" :title="`read ${stamp(vod.botChat.fetched_at)}`">
                {{ vod.botChat.rows ?? '?' }} messages · read {{ timeAgo(vod.botChat.fetched_at) }}
                <UiChip :tone="vod.botChat.keyed ? 'ok' : 'default'" :title="vod.botChat.keyed ? 'Read with a key: removals and their reasons are in' : 'Public read: no removals'">{{ vod.botChat.keyed ? 'keyed' : 'public' }}</UiChip>
                <UiChip v-if="botGaps.length" tone="warn" :title="botGaps.join('\n')">{{ botGaps.length }} {{ botGaps.length === 1 ? 'gap' : 'gaps' }}</UiChip>
              </dd>
              <dd v-else class="vods-muted">not read</dd>
            </div>
          </dl>
        </VodHeaderPanel>

        <!-- A synthetic VOD's details and segments are edited on its own page (the worker refuses them here). -->
        <section v-if="!vod.synthetic" class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow">Details</h2>
          <DetailsEditor :vod="vod" @saved="saved" />
        </section>

        <section class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow">Actions</h2>
          <VodActions :vod="vod" @job="jobStarted" @changed="load" @deleted="deleted" />
        </section>

        <section v-if="!vod.synthetic" class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow">Merge and split</h2>
          <SplicePanel :vod="vod" />
        </section>

        <section class="panel vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow">Jobs <span v-if="activeJobs" class="vods-muted">· {{ activeJobs }} active</span></h2>
          <JobsTable :jobs="jobs" empty="No jobs for this VOD." label="This VOD's jobs" />
        </section>

        <!-- A VOD merged into another, or a synthetic one, has no chapters, uploads or emotes of its own to edit. -->
        <template v-if="!vod.merged_into && !vod.synthetic">
          <!-- The Timeline workbench: the preview stays in view beside the editors that set times from it and draw on it.
               Both stay mounted under the tabs, so switching keeps a draft; its tab shows a dot. -->
          <section id="timeline" class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">Timeline</h2>
            <div class="workbench">
              <div class="preview">
                <MediaPreview :key="vod.id" :vod="vod" :duration="duration" />
              </div>
              <div class="editors">
                <UiTabs v-model="tab" :options="tabs" label="Timeline editor" class="tabs" />
                <div v-show="tab === 'chapters'" role="tabpanel" aria-label="Chapters">
                  <ChaptersEditor :vod="vod" :duration="duration" @saved="saved" @draft="(rows, dirty) => draft('chapters', rows, dirty)" />
                </div>
                <div v-show="tab === 'censor'" role="tabpanel" aria-label="Censor">
                  <CensorEditor :vod="vod" :duration="duration" @saved="saved" @draft="(rows, dirty) => draft('censor', rows, dirty)" />
                </div>
              </div>
            </div>
          </section>

          <section class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">YouTube parts</h2>
            <YoutubeEditor :vod="vod" @saved="saved" />
          </section>

          <section class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">Drive files</h2>
            <DriveEditor :vod="vod" @saved="saved" />
          </section>

          <section class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">Emotes</h2>
            <EmotesPanel :vod-id="vod.id" :spliced="isSpliced(vod)" @job="jobStarted" />
          </section>
        </template>
      </template>
    </UiLoadState>
  </ManageShell>
</template>

<style scoped>
a { color: inherit; }
.back { margin: -8px 0 16px; font-size: 13px; }
.panel { padding: 14px 16px; margin-bottom: 16px; }
h2 { margin: 0 0 12px; }
/* Phones: the preview sticks to the top edge, its picture shorter, over the editor scrolling under it. Wide screens: a
   sticky left column beside the editor. align-items: start keeps the column short enough to stick. */
#timeline { scroll-margin-top: 16px; }
.workbench { display: grid; gap: 14px; align-items: start; }
.preview { position: sticky; top: 0; z-index: 2; padding-block: 6px; background: var(--vods-bg); }
.preview :deep(.stage) { max-height: 20vh; }
/* The editors switch to their narrow rows by the width of their own column (@container vods), not the page. */
.editors { min-width: 0; container: vods / inline-size; }
.tabs { max-width: 100%; margin-bottom: 12px; }
@media (min-width: 960px) {
  .workbench { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; }
  .preview { top: 16px; padding-block: 0; background: none; }
  .preview :deep(.stage) { max-height: 70vh; }
}
</style>
