<script setup lang="ts">
// A list of game names (the worker's restricted and censor-allowed games): one chip per name, and a Twitch category search
// to add more. The values stay plain names; "No category" is the name itself. Typed text is kept as typed, for a game Twitch can't find.
import { NO_CATEGORY } from '../../index'
import { ref } from 'vue'
import type { GameValue } from './edits'
import GameSearch from './GameSearch.vue'

const model = defineModel<string[]>({ required: true })
defineProps<{ label?: string }>()

const blank = ref<GameValue>({ name: null, gameId: null, imageTemplate: null })

function add(g: GameValue) {
  const name = g.name ?? NO_CATEGORY
  if (!model.value.some((x) => x.toLowerCase() === name.toLowerCase())) model.value = [...model.value, name]
  blank.value = { name: null, gameId: null, imageTemplate: null }
}
function remove(name: string) {
  model.value = model.value.filter((x) => x !== name)
}
</script>

<template>
  <div class="games-list">
    <ul v-if="model.length" class="chips" :aria-label="label">
      <li v-for="name in model" :key="name">
        <UiChip>
          {{ name }}
          <button type="button" class="x" :aria-label="`Remove ${name}`" @click="remove(name)">×</button>
        </UiChip>
      </li>
    </ul>
    <GameSearch :model-value="blank" free-text blank="Add a game…" :label="label" @update:model-value="add" />
  </div>
</template>

<style scoped>
.games-list { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
.x { font: inherit; border: 0; background: none; color: var(--vods-muted); cursor: pointer; padding: 0 0 0 4px; }
.x:hover { color: var(--vods-ink); }
</style>
