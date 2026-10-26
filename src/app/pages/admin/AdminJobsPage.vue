<script setup lang="ts">
// /manage/jobs?state=&kind=&subject=: the worker's job runs (/api/v2/jobs), refreshed every few seconds. Filters live
// in the URL; the old `?vodId=` and `state=done` links still work.
import { ProblemError, errorText, type JobKindOut } from '@vex/platform-web'
import { JobsBrowser, StartJob, jobFiltersFrom, jobFiltersQuery, type JobFilters } from '@vex/platform-web/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ManageShell from '../../admin/ManageShell.vue'
import { platform, vodSubject } from '../../admin/platform'
import { site } from '../../site'

const route = useRoute()
const router = useRouter()

function setQuery(patch: Record<string, string>) {
  const next: Record<string, string> = { ...(route.query as Record<string, string>), ...patch }
  delete next.vodId
  for (const k of Object.keys(next)) if (!next[k]) delete next[k]
  router.replace({ query: next })
}

// The shared helpers, plus the old links: `?vodId=` and `state=done`.
const filters = computed<JobFilters>({
  get: () => {
    const f = jobFiltersFrom(route.query)
    const vodId = route.query.vodId
    return {
      ...f,
      state: f.state === 'done' ? 'succeeded' : f.state,
      subject: f.subject || (typeof vodId === 'string' && vodId ? vodSubject(vodId) : ''),
    }
  },
  set: (f) => {
    const { new: open } = route.query
    router.replace({ query: { ...jobFiltersQuery(f), ...(open === '1' ? { new: '1' } : {}) } })
  },
})
/** The VOD the subject filter names, for the Start dialog. */
const vodId = computed(() => (filters.value.subject.startsWith('vod:') ? filters.value.subject.slice(4) : ''))

const kinds = ref<JobKindOut[] | null>(null)

const starting = computed({
  get: () => route.query.new === '1',
  set: (v: boolean) => setQuery({ new: v ? '1' : '' }),
})
// A VOD the archive doesn't have yet: jobs need its row, which VODs → Add from Twitch makes.
const missingVod = (e: unknown) => e instanceof ProblemError && e.code === 'vod_not_found'

function started(id: number) {
  starting.value = false
  router.push(`/manage/jobs/${id}`)
}

onMounted(async () => {
  document.title = `Jobs · Manage · ${site.name}`
  try {
    kinds.value = await platform.jobKinds()
  } catch {
    kinds.value = []
  }
})
</script>

<template>
  <ManageShell title="Jobs">
    <template #actions>
      <UiButton variant="primary" @click="starting = true">Start a job</UiButton>
    </template>

    <JobsBrowser v-if="kinds" v-model:filters="filters" :client="platform" :kinds="kinds" subject-hint="vod:2345678901" />

    <StartJob
      v-model:open="starting"
      :client="platform"
      :kinds="kinds ?? []"
      :subject="vodId"
      default-kind="archive"
      subject-label="VOD id"
      subject-hint="2345678901"
      subject-help="Empty for jobs that aren't about one VOD."
      :to-subject="vodSubject"
      @started="(j) => started(j.id)"
    >
      <template #error="{ error, subject }">
        <template v-if="missingVod(error)">
          VOD {{ subject }} isn't in the archive yet. Add it from Twitch first: that archives it, or with
          “Details only”, adds it for jobs like this one.
          <UiButton size="sm" :to="`/manage/vods?add=${subject}`">Add from Twitch</UiButton>
        </template>
        <template v-else>{{ errorText(error) }}</template>
      </template>
    </StartJob>
  </ManageShell>
</template>
