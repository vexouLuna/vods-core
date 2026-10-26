<script setup lang="ts">
// /manage/vods/:id: fix one VOD by hand (the header panel shared with /manage/synthetic/:id, details, chapters, games, YouTube and Drive lists, censor ranges,
// emotes) and run its jobs. The preview plays its server file or its uploads for the editors under it to set times
// from and draw censor boxes on.
import { timeAgo } from '../../lib/time'
import { toClock } from '../../../index'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { isSpliced, type AdminVod } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import CensorEditor from '../../admin/CensorEditor.vue'
import ChaptersEditor from '../../admin/ChaptersEditor.vue'
import DetailsEditor from '../../admin/DetailsEditor.vue'
import DriveEditor from '../../admin/DriveEditor.vue'
import { vodSeconds } from '../../admin/edits'
import EmotesPanel from '../../admin/EmotesPanel.vue'
import GamesEditor from '../../admin/GamesEditor.vue'
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
providePreview()

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
          <section id="preview" class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">Preview</h2>
            <MediaPreview :key="vod.id" :vod="vod" :duration="duration" />
          </section>

          <section class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">Chapters</h2>
            <ChaptersEditor :vod="vod" :duration="duration" @saved="saved" />
          </section>

          <section class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">Games</h2>
            <GamesEditor :vod="vod" :duration="duration" @saved="saved" />
          </section>

          <section class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">YouTube parts</h2>
            <YoutubeEditor :vod="vod" @saved="saved" />
          </section>

          <section id="censor" class="panel vods-panel vx-glass-rim">
            <h2 class="vods-eyebrow">Censor</h2>
            <CensorEditor :vod="vod" :duration="duration" @saved="saved" />
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
</style>
