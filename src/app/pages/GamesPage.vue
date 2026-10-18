<script setup lang="ts">
// /games/:id?part=N: a VOD's per-game uploads (one YouTube video per game). Each game plays on its own timeline that
// keeps VOD time, so the bar, chapters and chat line up with the full VOD. `?part=` is the 1-based game (old URLs).
// On a synthetic VOD the games keep its time too, and chat follows the source VOD each moment comes from.
import { clamp } from '@vex/ui/utils'
import { parseTimestamp, toClock, toHMS, type GameUpload } from '../../index'
import { useVodsContext, useWatch } from '../../vue/index'
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WatchView from '../components/WatchView.vue'
import { gameName, gameTimeline } from '../lib/games'
import VodsShell from '../components/VodsShell.vue'
import { site } from '../site'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const { config } = useVodsContext()
const { vod, sources, segments, loading, notFound, error, reload } = useWatch(() => props.id)

const games = computed(() => vod.value?.games ?? [])
const index = computed(() => {
  const n = Number(route.query.part) || 1
  return clamp(n, 1, Math.max(games.value.length, 1)) - 1
})
const game = computed<GameUpload | null>(() => games.value[index.value] ?? null)
const timeline = computed(() => (vod.value && game.value ? gameTimeline(vod.value, game.value, { defaultPartDuration: config.defaultPartDuration }) : null))
const start = computed(() => {
  const tl = timeline.value
  const g = game.value
  if (!tl || !g) return null
  const t = parseTimestamp(typeof route.query.t === 'string' ? route.query.t : null)
  return tl.locate(t >= g.start && t < g.end ? t : g.start)
})
const range = computed(() => (game.value ? { start: game.value.start, end: game.value.end } : undefined))

const shareUrl = (t: number) => `${location.origin}${route.path}?part=${index.value + 1}&t=${toHMS(t)}`
const pick = (i: number) => router.push({ query: { part: String(i + 1) } })

watchEffect(() => {
  document.title = vod.value && game.value ? `${gameName(game.value)} · ${vod.value.title} · ${site.name}` : site.name
})
</script>

<template>
  <WatchView
    v-if="vod && game && timeline && start"
    :key="`${vod.id}:${index}`"
    :vod="vod"
    :timeline="timeline"
    :segments="segments"
    :sources="sources"
    :start="start"
    :range="range"
    :part-label="() => gameName(game!)"
    :share-url="shareUrl"
    :track="false"
  >
    <template #parts>
      <UiPopover prefer="up" align="right" width="min(340px, calc(100vw - 24px))" :cap="360">
        <template #trigger="{ toggle, open }">
          <UiButton class="vods-mono" :pressed="open" label="Game" @click="toggle">
            Game {{ index + 1 }}<span class="vods-muted">/{{ games.length }}</span> ▾
          </UiButton>
        </template>
        <template #default="{ close }">
          <div class="vods-eyebrow menu-head">Games in this VOD · {{ games.length }}</div>
          <UiMenuItem
            v-for="(g, i) in games"
            :key="g.id"
            :current="i === index"
            :sub="`${toClock(g.start)}–${toClock(g.end)}`"
            @click="pick(i); close()"
          >
            {{ gameName(g) }}
          </UiMenuItem>
          <UiMenuItem :to="`/vods/${encodeURIComponent(vod.id)}`" @click="close()">
            Full VOD<template #trail><UiChip>all parts</UiChip></template>
          </UiMenuItem>
        </template>
      </UiPopover>
    </template>
  </WatchView>
  <VodsShell v-else>
    <UiCallout v-if="error" tone="error" title="Couldn't load this VOD">
      {{ error.message }}
      <template #actions><UiButton size="sm" @click="reload">Try again</UiButton></template>
    </UiCallout>
    <UiEmptyState v-else-if="notFound" code="404" title="No VOD with that id" text="It may never have been archived, or the link is mistyped.">
      <template #actions><UiButton to="/vods" variant="primary">Browse VODs</UiButton></template>
    </UiEmptyState>
    <UiEmptyState v-else-if="vod && !games.length" title="No per-game uploads" :text="`“${vod.title}” wasn't split into games.`">
      <template #actions><UiButton :to="`/vods/${encodeURIComponent(vod.id)}`" variant="primary">Watch the full VOD</UiButton></template>
    </UiEmptyState>
    <div v-else-if="loading" class="loading" aria-busy="true">
      <UiSkeleton ratio="16 / 9" h="auto" />
      <UiSkeleton w="60%" />
    </div>
  </VodsShell>
</template>

<style scoped>
.loading { display: flex; flex-direction: column; gap: 10px; }
.menu-head { padding: 6px 8px; }
</style>
