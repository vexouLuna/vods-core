<script setup lang="ts">
// The YouTube check's problems, one panel per VOD with each upload's issues: the overview's recent ones and /manage/youtube's all.
// A blocked or rejected part gets "Fix claim": its Studio Copyright page, and a paste of the claims Studio shows there,
// which the worker mutes or blacks out before uploading the part again (POST /admin/part/dmca).
import { useToast } from '@vex/ui/utils'
import { computed, ref } from 'vue'
import { errorText } from '@vex/platform-web'
import type { YoutubeIssue, YoutubeVodReport } from './api'
import { YOUTUBE_ISSUES, claimLink, issueLink, issueWhere, percent } from './health'
import { admin } from './session'
import { toClock } from '../../time'

defineProps<{ problems: YoutubeVodReport[] }>()
const toast = useToast()

const fixing = ref<{ vodId: string; issue: YoutubeIssue } | null>(null)
const fixOpen = computed({ get: () => fixing.value !== null, set: (v) => { if (!v) fixing.value = null } })
const claimsText = ref('')
const claims = computed<unknown[] | null>(() => {
  try {
    const v: unknown = JSON.parse(claimsText.value)
    return Array.isArray(v) && v.length ? v : null
  } catch {
    return null
  }
})
const busy = ref(false)

function openFix(vodId: string, issue: YoutubeIssue) {
  claimsText.value = ''
  fixing.value = { vodId, issue }
}

async function fix() {
  const f = fixing.value
  if (!f || !claims.value || f.issue.part == null) return
  busy.value = true
  try {
    const res = await admin.partDmca(f.vodId, f.issue.part, f.issue.type === 'live' ? 'live' : 'vod', claims.value)
    toast.show(res.msg, { duration: 3500 })
    fixing.value = null
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ul class="problems">
    <li v-for="p in problems" :key="p.id" class="problem vods-panel vx-glass-rim">
      <div class="problem-head">
        <RouterLink :to="`/manage/vods/${p.id}`" class="problem-title">{{ p.title || p.id }}</RouterLink>
        <span class="vods-muted small" :title="p.planned < p.seconds ? 'Restricted games are left out of the uploads on purpose' : undefined">
          <template v-if="p.createdAt">{{ p.createdAt.slice(0, 10) }} · </template>{{ percent(p.share) }} of {{ toClock(p.seconds) }} on YouTube<template v-if="p.planned < p.seconds - 60"> · {{ toClock(p.planned) }} planned</template>
        </span>
      </div>
      <ul class="issues">
        <li v-for="(i, n) in p.issues" :key="n" class="issue">
          <UiChip :tone="i.severity === 'bad' ? 'bad' : 'warn'">{{ YOUTUBE_ISSUES[i.kind] ?? i.kind }}</UiChip>
          <span class="small">{{ issueWhere(i) }}: {{ i.detail }}</span>
          <a v-if="issueLink(i)" class="link small" :href="issueLink(i)" target="_blank" rel="noopener">Open</a>
          <UiButton v-if="claimLink(i)" size="sm" @click="openFix(p.id, i)">Fix claim…</UiButton>
        </li>
      </ul>
    </li>
  </ul>

  <UiDialog v-model:open="fixOpen" title="Fix a claim">
    <template v-if="fixing">
      <p class="small">
        {{ fixing.vodId }}, {{ issueWhere(fixing.issue) }}. Open its
        <a class="link" :href="claimLink(fixing.issue)" target="_blank" rel="noopener">Copyright page in YouTube Studio</a>,
        open DevTools → Network and reload, find the response with <code>receivedClaims</code> and paste that array here.
      </p>
      <UiField label="receivedClaims">
        <template #default="{ id }"><UiTextarea :id="id" v-model="claimsText" :rows="6" placeholder="[ … ]" /></template>
      </UiField>
      <p class="small vods-muted">
        Blocking claims only: audio is muted, video blacked out, then the part is uploaded again as a new video. The old
        one stays on YouTube until you remove it in Studio.
      </p>
    </template>
    <template #actions="{ close }">
      <UiButton @click="close">Cancel</UiButton>
      <UiButton variant="primary" :disabled="!claims" :loading="busy" @click="fix">Start</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.problems, .issues { list-style: none; margin: 0; padding: 0; }
.problems { display: flex; flex-direction: column; gap: 8px; }
.problem { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.problem-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.problem-title { color: var(--vods-ink); font-weight: 600; overflow-wrap: anywhere; }
.issues { display: flex; flex-direction: column; gap: 6px; }
.issue { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.link { color: var(--vods-accent); text-decoration: underline; text-underline-offset: 2px; }
.link:hover { color: var(--vods-ink); }
.small { font-size: 12px; }
</style>
