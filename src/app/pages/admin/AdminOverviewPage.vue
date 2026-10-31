<script setup lang="ts">
import { useToast } from '@vex/ui/utils'
import { timeAgo } from '../../lib/time'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JobsTable, usePoll } from '@vex/platform-web/vue'
import { errorText } from '@vex/platform-web'
import type { Health, StorageView } from '../../admin/api'
import {
  type HealthLine,
  RECENT_PROBLEM_DAYS,
  STUCK_QUERY,
  diskLine,
  doomtpLine,
  quotaLine,
  splitProblems,
  stuckLine,
  stuckVods,
  twitchAppLine,
  uploadStandingLine,
  youtubeCheckLine,
  youtubeCheckMessage,
} from '../../admin/health'
import ManageShell from '../../admin/ManageShell.vue'
import TwitchViewerTile from '../../admin/TwitchViewerTile.vue'
import YoutubeProblems from '../../admin/YoutubeProblems.vue'
import { platform } from '../../admin/platform'
import { admin } from '../../admin/session'
import { site } from '../../site'

const { data: health, error, loading, refresh } = usePoll((signal) => admin.health(signal), 15_000)
const toast = useToast()
// v2 runs, as the jobs page lists them: per state, and the latest failures.
const { data: jobCounts } = usePoll((signal) => platform.jobCounts({}, signal), 15_000)
const { data: failures } = usePoll((signal) => platform.jobs({ state: ['failed'], limit: 10 }, signal), 15_000)
// The captures running now (a live recording, a VOD being archived), for the Stream row's links.
const CAPTURE_KINDS: Record<string, string> = { live: 'Live capture', archive: 'Archive capture' }
const { data: running } = usePoll((signal) => platform.jobs({ state: ['running'], limit: 50 }, signal), 15_000)
const captures = computed(() => (running.value?.items ?? []).filter((j) => j.kind in CAPTURE_KINDS))

/** Counts by state, each linked to the jobs page filtered to it. */
const COUNT_STATES = [
  { state: 'queued', tone: 'default' },
  { state: 'running', tone: 'accent' },
  { state: 'paused', tone: 'warn' },
  { state: 'succeeded', tone: 'ok' },
  { state: 'failed', tone: 'bad' },
  { state: 'cancelled', tone: 'default' },
] as const

// Uploads and storage: the VODs nothing is archiving, and the disk (the worker caches its walk, so once is enough).
const { data: stuck, error: stuckError } = usePoll((signal) => stuckVods(signal), 60_000)
const storage = ref<StorageView | null>(null)
const storageDone = ref(false)
// Whether the uploads are still on YouTube and whole: the worker's last check (an older worker has none: no tile).
const { data: ytCheck, error: ytCheckError, refresh: refreshYtCheck } = usePoll((signal) => admin.youtubeVideos(signal), 60_000)
// The last two weeks' VODs here; the older problems (some never fixable) are on /manage/youtube.
const problems = computed(() => splitProblems(ytCheck.value?.last))
const checking = ref(false)
async function checkYoutube() {
  checking.value = true
  try {
    const res = await admin.checkYoutubeVideos()
    ytCheck.value = res
    if (res.last) toast.show(youtubeCheckMessage(res.last), { duration: 4000 })
  } catch (e) {
    toast.show(`Couldn't check the uploads on YouTube: ${errorText(e)}`, { kind: 'error', duration: 6000 })
    void refreshYtCheck()
  } finally {
    checking.value = false
  }
}
onMounted(async () => {
  document.title = `Overview · Manage · ${site.name}`
  try {
    storage.value = await admin.storage()
  } catch {
    storage.value = null // no tile; /manage/storage has the error
  } finally {
    storageDone.value = true
  }
})

type Dot = 'live' | 'ok' | 'warn' | 'off'
/** A tile whose answer hasn't come yet, so every tile is there from the first paint. */
const pending = (name: string) => ({ name, status: 'off' as Dot, text: 'Loading…', sub: '', loading: true })
const DAY = 86_400_000
/** How long the YouTube token has left, or how old it is when Google gave no end. */
function tokenAge(yt: NonNullable<Health['youtube']>): { text: string; soon: boolean } | undefined {
  if (yt.refreshTokenExpiresAt) {
    const left = new Date(yt.refreshTokenExpiresAt).getTime() - Date.now()
    if (left <= 0) return { text: 'token ended, connect again', soon: true }
    const days = Math.ceil(left / DAY)
    return { text: `token ends in ${days} day${days === 1 ? '' : 's'}`, soon: left < 2 * DAY }
  }
  if (yt.connectedAt) {
    // In days, so a Testing project's 7-day limit is easy to read off.
    const days = Math.floor((Date.now() - new Date(yt.connectedAt).getTime()) / DAY)
    return { text: days < 1 ? `connected ${timeAgo(yt.connectedAt)}` : `connected ${days} day${days === 1 ? '' : 's'} ago`, soon: false }
  }
  return undefined
}
interface Tile {
  name: string
  status: Dot
  text: string
  sub: string
  loading?: boolean
  link?: { text: string; href: string }
  age?: { text: string; soon: boolean }
  standing?: HealthLine
  action?: 'switch' | 'connect'
}
const tiles = computed((): Tile[] => {
  const h = health.value
  // A worker from before DTP bot or the Twitch app leaves them out: their stand-ins go once it answers.
  if (!h) return ['Worker', 'Archive API', 'YouTube', 'DTP bot', 'Twitch app'].map(pending)
  const yt = h.youtube
  const bot = h.doomtp ? doomtpLine(h.doomtp, timeAgo) : null
  const app = h.twitchApp ? twitchAppLine(h.twitchApp) : null
  // Whether YouTube lets the channel upload; a refused upload's job error points here.
  const standing = yt?.authorized && yt.valid ? uploadStandingLine(yt) : null
  return [
    {
      name: 'Worker',
      status: (h.worker.ok ? 'ok' : 'warn') as Dot,
      text: h.worker.ok ? `${h.worker.runningJobs} running` : 'Not healthy',
      sub: h.worker.startedAt ? `up since ${timeAgo(h.worker.startedAt)}` : '',
    },
    { name: 'Archive API', status: (h.api?.ok ? 'ok' : 'warn') as Dot, text: h.api?.ok ? 'Reachable' : 'Unreachable', sub: '' },
    {
      name: 'YouTube',
      status: (!yt ? 'off' : yt.authorized && yt.valid ? 'ok' : 'warn') as Dot,
      text: !yt ? 'Unknown' : !yt.authorized ? 'Not connected' : yt.valid ? 'Connected' : yt.channel === null ? 'No channel' : 'Token invalid',
      // The channel uploads go to, so a wrong account is caught before a job uploads there.
      link: yt?.channel ? { text: yt.channel.title, href: yt.channel.url } : undefined,
      age: yt?.authorized ? tokenAge(yt) : undefined,
      standing: standing ?? undefined,
      sub: yt?.error ?? (yt?.checkedAt ? `checked ${timeAgo(yt.checkedAt)}` : ''),
      action: !yt ? undefined : yt.authorized && yt.valid ? 'switch' : 'connect',
    },
    // doomtp-bot, where bot chat comes from; a worker from before it leaves `doomtp` out.
    ...(bot ? [{ name: 'DTP bot', status: bot.status as Dot, text: bot.text, sub: bot.sub }] : []),
    // The app behind the censor check (IGDB), not the ad-free account below; a worker from before it leaves it out.
    ...(app ? [{ name: 'Twitch app', status: app.status as Dot, text: app.text, sub: app.sub }] : []),
  ]
})

/** The YouTube quota spent today, the stuck VODs and the disk, each with where to look further. */
const uploadTiles = computed(() => {
  const quota = health.value?.youtube?.quota
  const disk = storage.value?.disk
  const out: { name: string; status: Dot; text: string; sub: string; to?: string; toText?: string; title?: string; loading?: boolean }[] = []
  if (!health.value) out.push(pending('YouTube quota'))
  else if (quota) {
    const q = quotaLine(quota)
    const calls = Object.entries(quota.calls).map(([k, n]) => `${k} × ${n}`).join(', ')
    out.push({ name: 'YouTube quota', status: q.warn ? 'warn' : 'ok', text: q.text, sub: q.sub, title: calls || 'No calls today' })
  }
  if (ytCheck.value) {
    const y = youtubeCheckLine(ytCheck.value)
    const at = ytCheck.value.last?.checkedAt
    out.push({ name: 'On YouTube', status: y.warn ? 'warn' : ytCheck.value.last ? 'ok' : 'off', text: y.text, sub: at ? `${y.sub} · checked ${timeAgo(at)}` : y.sub, to: problems.value.recent.length ? '#youtube-uploads' : problems.value.older.length ? '/manage/youtube' : undefined, toText: 'See them' })
  } else if (!ytCheckError.value) out.push(pending('On YouTube'))
  if (stuck.value) {
    const s = stuckLine(stuck.value)
    out.push({ name: 'Stuck VODs', status: s.warn ? 'warn' : 'ok', text: s.text, sub: s.sub, to: s.warn ? `/manage/vods?upload=${STUCK_QUERY.upload}` : undefined, toText: 'List them' })
  } else if (!stuckError.value) out.push(pending('Stuck VODs'))
  if (!storageDone.value) out.push(pending('Disk'))
  else if (disk) {
    const d = diskLine(disk)
    out.push({ name: 'Disk', status: d.warn ? 'warn' : 'ok', text: d.text, sub: d.sub, to: '/manage/storage', toText: 'Storage' })
  }
  return out
})

const router = useRouter()
const backfilling = ref(false)
/** Bot chat for every VOD that has none yet. */
async function backfillBotChat() {
  backfilling.value = true
  try {
    const res = await admin.botChatBackfill()
    toast.show(res.msg, { duration: 3500 })
    if (res.jobId != null) void router.push(`/manage/jobs/${res.jobId}`)
  } catch (e) {
    toast.show(`Couldn't start the bot chat backfill: ${errorText(e)}`, { kind: 'error', duration: 5000 })
  } finally {
    backfilling.value = false
  }
}

async function connectYoutube() {
  try {
    const { url } = await admin.youtubeAuthUrl()
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    toast.show(`Couldn't start the YouTube connection: ${errorText(e)}`, { kind: 'error', duration: 5000 })
  }
}
</script>

<template>
  <ManageShell title="Overview">
    <template #actions>
      <UiButton :loading="loading" @click="refresh">Refresh</UiButton>
      <UiButton :loading="backfilling" title="Read doomtp-bot’s chat for every VOD that doesn’t have it yet" @click="backfillBotChat">Backfill bot chat</UiButton>
      <UiButton variant="primary" to="/manage/jobs?new=1">Start a job</UiButton>
    </template>

    <!-- Every tile is there from the first paint; the ones still waiting for an answer say Loading. -->
    <UiLoadState
      :error="error"
      :stale="!!health"
      error-title="Couldn't load the archive's status"
      stale-title="Couldn't refresh the archive's status"
      @retry="refresh"
    >
        <section class="stream vods-panel" aria-label="Stream and jobs">
          <div class="stream-state">
            <span class="vods-eyebrow">Stream</span>
            <UiStatusDot :status="health?.live?.live ? 'live' : 'off'" :label="!health ? 'Loading…' : health.live?.live ? 'Live' : 'Offline'" />
            <span v-if="health?.live?.live && health.live.startedAt" class="vods-muted small">started {{ timeAgo(health.live.startedAt) }}</span>
          </div>
          <div class="captures">
            <RouterLink v-for="j in captures" :key="j.id" :to="`/manage/jobs/${j.id}`" class="tile-link small">
              {{ CAPTURE_KINDS[j.kind] }}{{ j.subject?.startsWith('vod:') ? ` ${j.subject.slice(4)}` : '' }} · {{ j.step ?? 'starting' }}
            </RouterLink>
            <span v-if="running && !captures.length" class="vods-muted small">No capture running</span>
          </div>
          <div class="counts" aria-label="Jobs by state">
            <RouterLink v-for="s in COUNT_STATES" :key="s.state" :to="`/manage/jobs?state=${s.state}`" class="count">
              <UiChip :tone="jobCounts?.counts[s.state] ? s.tone : 'default'" :k="s.state">{{ jobCounts?.counts[s.state] ?? '…' }}</UiChip>
            </RouterLink>
          </div>
        </section>

        <div class="tiles">
          <UiStatTile v-for="t in tiles" :key="t.name" :class="{ 'is-loading': t.loading }" :aria-busy="t.loading" :label="t.name" :status="t.status" :headline="t.text" :sub="t.sub">
            <a v-if="t.link" class="tile-link small" :href="t.link.href" target="_blank" rel="noopener">{{ t.link.text }}</a>
            <div v-if="t.age" class="small" :class="t.age.soon ? 'tile-soon' : 'vods-muted'">{{ t.age.text }}</div>
            <div v-if="t.standing" class="small standing" :class="t.standing.warn ? 'tile-soon' : 'vods-muted'" title="What decides whether YouTube accepts an upload">
              <div>Uploads: {{ t.standing.text }}</div>
              <div>{{ t.standing.sub }}</div>
            </div>
            <UiButton v-if="t.action === 'connect'" @click="connectYoutube">Connect YouTube</UiButton>
            <UiButton v-else-if="t.action === 'switch'" size="sm" title="Connect a different Google account or channel" @click="connectYoutube">Switch account</UiButton>
          </UiStatTile>
          <UiStatTile
            v-for="t in uploadTiles"
            :key="t.name"
            :class="{ 'is-loading': t.loading }"
            :aria-busy="t.loading"
            :title="t.title"
            :label="t.name"
            :status="t.status"
            :headline="t.text"
            :sub="t.sub"
            :to="t.to?.startsWith('#') ? undefined : t.to"
            :href="t.to?.startsWith('#') ? t.to : undefined"
            :link-label="t.toText"
          />
          <!-- A worker from before the ad-free account leaves twitchViewer out. -->
          <UiStatTile v-if="!health" class="is-loading" aria-busy="true" label="Twitch (ad-free)" headline="Loading…" />
          <TwitchViewerTile v-else-if="health.twitchViewer !== undefined" :status="health.twitchViewer" @changed="refresh" />
        </div>

        <section>
          <h2 class="vods-eyebrow">Recent failures</h2>
          <JobsTable :jobs="failures?.items ?? []" empty="No failed jobs. 🎉" label="Recent failures" />
        </section>

        <section v-if="ytCheck" id="youtube-uploads">
          <div class="section-head">
            <h2 class="vods-eyebrow">YouTube uploads</h2>
            <UiButton size="sm" :loading="checking || ytCheck.running" title="Look up every upload on YouTube now (1 API unit per 50 videos)" @click="checkYoutube">Check now</UiButton>
          </div>
          <p v-if="!ytCheck.last" class="vods-muted small">Not checked yet.</p>
          <p v-else-if="!problems.recent.length && !problems.older.length" class="vods-muted small">
            Every upload of {{ ytCheck.last.vods }} VODs is on YouTube and whole (checked {{ timeAgo(ytCheck.last.checkedAt) }}).
          </p>
          <template v-else>
            <p v-if="!problems.recent.length" class="vods-muted small">No problems with VODs from the last {{ RECENT_PROBLEM_DAYS }} days.</p>
            <YoutubeProblems v-else :problems="problems.recent" />
            <p v-if="problems.older.length" class="vods-muted small older">
              {{ problems.older.length }} older VOD{{ problems.older.length === 1 ? '' : 's' }} with problems.
              <RouterLink class="tile-link" to="/manage/youtube">See them all</RouterLink>
            </p>
          </template>
        </section>
    </UiLoadState>
  </ManageShell>
</template>

<style scoped>
.stream { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 20px; padding: 12px 16px; margin-bottom: 16px; }
.stream-state { display: flex; align-items: center; gap: 10px; }
.captures { display: flex; flex-wrap: wrap; gap: 6px 14px; flex: 1 1 200px; }
.is-loading { opacity: 0.6; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 28px; }
.tile-link { color: var(--vods-accent); text-decoration: underline; text-underline-offset: 2px; }
.tile-link:hover { color: var(--vods-ink); }
.tile-soon { color: var(--vods-warn); }
.small { font-size: 12px; }
.standing { overflow-wrap: anywhere; }
section { margin-bottom: 28px; }
h2 { margin: 0 0 10px; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; }
.count { text-decoration: none; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.section-head h2 { margin: 0; }
.older { margin: 10px 0 0; }
</style>
