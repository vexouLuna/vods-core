<script setup lang="ts">
// The home page: the cards set on /manage/home, in order (lib/siteOptions): the newest VOD in its own panel (the live
// stream instead, while the channel is live), the newest VOD of a tag in that panel, the two newest of a tag
// (playthroughs) with what each one is, and the most played games. A tag card shows only while its tag is a home
// category, whatever the saved cards say. The full lists are their own pages (the header and each card's "see all" button); a game card
// opens the VODs list narrowed to that game.
import { resumeProgress, type GamePlayed, type LiveStatus, type Progress, type Vod } from '../../index'
import { useVods, useVodsContext } from '../../vue/index'
import { computed, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import LatestOne from '../components/LatestOne.vue'
import LatestTagged from '../components/LatestTagged.vue'
import LatestVod from '../components/LatestVod.vue'
import LiveNow from '../components/LiveNow.vue'
import MostPlayed from '../components/MostPlayed.vue'
import VodsShell from '../components/VodsShell.vue'
import { loadGamesPlayed } from '../lib/gamesPlayed'
import { shownHomeCards, siteOptions } from '../lib/siteOptions'
import { tagConfig } from '../lib/vodTags'
import { site } from '../site'
import { listPath, parseListQuery, toApiFilter, toListQuery } from '../lib/listQuery'

const { client, progress } = useVodsContext()
const router = useRouter()

const cards = computed(() => shownHomeCards(siteOptions.value.homeCards, tagConfig.value))

const { vods: latestVods } = useVods(() => ({ ...toApiFilter(parseListQuery({}, 'vods')), page: 1, perPage: 1 }))
const latest = computed(() => latestVods.value[0] ?? null)

// Offline, or the status call failed: the latest VOD shows as usual.
const live = shallowRef<LiveStatus | null>(null)
client.liveStatus().then((s) => (live.value = s)).catch(() => undefined)

const games = shallowRef<GamePlayed[] | null>(null)
const gamesError = ref<string | null>(null)
function fetchGames(retry = false) {
  gamesError.value = null
  loadGamesPlayed(client, retry)
    .then((g) => (games.value = g))
    .catch((e: Error) => (gamesError.value = e.message || 'Something went wrong'))
}
fetchGames()
const openGame = (game: string) => router.push({ path: listPath('vods'), query: toListQuery({ ...parseListQuery({}), game }) })

const saved = shallowRef(new Map<string, Progress>())
progress
  .list(500)
  .then((all) => (saved.value = new Map(all.map((p) => [p.vodId, p]))))
  .catch(() => undefined)
/** Where to pick a VOD up, if anywhere: one that grew since it was finished (a playthrough's new stream) at the new part. */
const resumeOf = (v: Vod) => resumeProgress(saved.value.get(v.id), v.duration)
</script>

<template>
  <VodsShell>
    <!-- The page's heading for screen readers and outlines; the header already shows the name. -->
    <h1 class="sr-only">{{ site.name }}</h1>
    <section class="top">
      <template v-for="c in cards" :key="c.id">
        <template v-if="c.type === 'live'">
          <LiveNow v-if="live" :live="live" />
          <LatestVod v-else-if="latest" :vod="latest" :progress="resumeOf(latest)" />
        </template>
        <LatestOne v-else-if="c.type === 'vods' && c.count === 1" :tag="c.tag" :resume="resumeOf" />
        <LatestTagged v-else-if="c.type === 'vods'" :tag="c.tag" :resume="resumeOf" />
        <MostPlayed v-else :games="games" :error="gamesError" @game="openGame" @retry="fetchGames(true)" />
      </template>
    </section>
  </VodsShell>
</template>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.top { display: flex; flex-direction: column; gap: 10px; }
</style>
