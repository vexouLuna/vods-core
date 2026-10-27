<script setup lang="ts">
// Builds a playthrough: pick its games (a series may span several), then the windows of real VODs that played any of
// them (GET /api/v2/playthrough-candidates: oldest first, games back to back in one VOD as one window, as the archive
// keeps a followed playthrough), and add them as segments, in that order.
import { toClock } from '../../index'
import { computed, ref, watch } from 'vue'
import { errorText } from '@vex/platform-web'
import type { PlaythroughWindow } from './api'
import GameIdListInput, { type GameRef } from './GameIdListInput.vue'
import { admin } from './session'

const emit = defineEmits<{ add: [windows: PlaythroughWindow[], games: GameRef[]] }>()

const games = ref<GameRef[]>([])
const windows = ref<PlaythroughWindow[] | null>(null)
const picked = ref(new Set<string>())
const error = ref<string | null>(null)
const key = (w: PlaythroughWindow) => `${w.vod_id}@${w.start}`

let ctrl: AbortController | null = null
watch(
  () => games.value.map((g) => g.id),
  async (ids) => {
    ctrl?.abort()
    windows.value = null
    error.value = null
    if (!ids.length) return
    const mine = (ctrl = new AbortController())
    try {
      const { items } = await admin.playthroughCandidates(ids, mine.signal)
      windows.value = items
      picked.value = new Set(items.map(key))
    } catch (e) {
      if (!mine.signal.aborted) error.value = errorText(e)
    }
  },
)

const toggle = (w: PlaythroughWindow, on: boolean) => {
  const next = new Set(picked.value)
  if (on) next.add(key(w))
  else next.delete(key(w))
  picked.value = next
}
const chosen = computed(() => (windows.value ?? []).filter((w) => picked.value.has(key(w))))
const total = computed(() => chosen.value.reduce((s, w) => s + w.length, 0))
</script>

<template>
  <div class="builder">
    <GameIdListInput v-model="games" label="Games" />
    <p v-if="!games.length" class="vods-muted small">
      Pick a game (or each game of a series) to see every window of a public VOD that played it, oldest first.
    </p>
    <UiCallout v-else-if="error" tone="error" title="Couldn't find its windows">{{ error }}</UiCallout>
    <div v-else-if="!windows" class="sk" aria-busy="true"><UiSkeleton v-for="i in 3" :key="i" h="28px" /></div>
    <p v-else-if="!windows.length" class="vods-muted small">No public VOD has a chapter of {{ games.length === 1 ? games[0]!.name : 'any of these games' }}.</p>
    <template v-else>
      <ul class="windows">
        <li v-for="w in windows" :key="key(w)">
          <UiCheckbox :model-value="picked.has(key(w))" :label="w.title ?? `VOD ${w.vod_id}`" @update:model-value="(on: boolean) => toggle(w, on)" />
          <span class="vods-muted small vods-mono">{{ w.created_at.slice(0, 10) }} · {{ w.vod_id }} · {{ toClock(w.start) }}–{{ toClock(w.end) }} ({{ toClock(w.length) }})</span>
        </li>
      </ul>
      <div class="row">
        <UiButton variant="primary" :disabled="!chosen.length" @click="emit('add', chosen, games)">
          Add {{ chosen.length }} {{ chosen.length === 1 ? 'window' : 'windows' }} ({{ toClock(total) }})
        </UiButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.builder { display: grid; gap: 10px; }
.small { font-size: 13px; margin: 0; }
.sk { display: grid; gap: 6px; }
.windows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.windows li { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; }
.row { display: flex; gap: 8px; }
</style>
