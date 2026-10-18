<script setup lang="ts">
// A job the worker's censor check paused before `censor`: the games IGDB flagged (an age-rating content descriptor or
// theme in the "censor_descriptors" setting) and the answers. Resume (the job page's own button) uploads with the
// censor ranges set by now; "Cut these games" leaves their chapters out of the uploads first.
import { errorText, type JobOut } from '@vex/platform-web'
import { useToast } from '@vex/ui/utils'
import { computed, ref } from 'vue'
import { admin } from './session'

type Flagged = { gameId: string | null; name: string | null; matched: string[]; error?: string }

const props = defineProps<{ job: JobOut }>()
const emit = defineEmits<{ resumed: [] }>()
const toast = useToast()

const games = computed(() => {
  const review = props.job.payload?.censor_review as { games?: Flagged[] } | undefined
  return props.job.state === 'paused' && props.job.step === 'censor' ? (review?.games ?? []) : []
})
const vodId = computed(() => props.job.subject?.match(/^vod:(.+)$/)?.[1] ?? null)
const canCut = computed(() => games.value.some((g) => g.gameId))
const busy = ref(false)

async function cut() {
  busy.value = true
  try {
    toast.show((await admin.censorReview(props.job.id, 'cut')).message)
    emit('resumed')
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="games.length" class="review" role="note">
    <strong>Censor review:</strong>
    <span v-for="(g, i) in games" :key="i">
      <template v-if="g.error">{{ g.error }}</template>
      <template v-else>{{ g.name }} <span class="vods-muted">({{ g.matched.join(', ') }})</span></template>
    </span>
    <span class="vods-muted">Set censor ranges and resume, resume to upload as it is, or cut the games.</span>
    <RouterLink v-if="vodId" class="vxp-btn" :to="`/manage/vods/${vodId}#censor`">Censor ranges</RouterLink>
    <button v-if="canCut" type="button" class="vxp-btn danger" :disabled="busy" :aria-busy="busy" @click="cut">Cut these games</button>
  </div>
</template>

<style scoped>
.review { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; flex-basis: 100%; font-size: 13px; }
</style>
