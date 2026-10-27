<script setup lang="ts">
// A list of Twitch games by id (the ones a playthrough follows or is built from): one chip per game, and a Twitch
// category search to add more. Unlike GameListInput (plain names), a game Twitch can't find or "No category" can't be
// added. A name is null when only the id is known; `nameOf` words it then.
import { ref } from 'vue'
import type { GameValue } from './edits'
import GameSearch from './GameSearch.vue'

export interface GameRef {
  id: string
  name: string | null
}

const model = defineModel<GameRef[]>({ required: true })
const props = defineProps<{ label: string; nameOf?: (g: GameRef) => string }>()

const blank = (): GameValue => ({ name: null, gameId: null, imageTemplate: null })
const search = ref<GameValue>(blank())
const name = (g: GameRef) => props.nameOf?.(g) ?? g.name ?? `game ${g.id}`

function add(g: GameValue) {
  if (g.gameId && !model.value.some((x) => x.id === g.gameId)) model.value = [...model.value, { id: g.gameId, name: g.name }]
  search.value = blank()
}
</script>

<template>
  <div class="games">
    <ul v-if="model.length" class="chips" :aria-label="label">
      <li v-for="g in model" :key="g.id">
        <UiChip :title="`Twitch game ${g.id}`">
          {{ name(g) }}
          <button type="button" class="x" :aria-label="`Remove ${name(g)}`" @click="model = model.filter((x) => x.id !== g.id)">×</button>
        </UiChip>
      </li>
    </ul>
    <GameSearch :model-value="search" blank="Add a game…" :label="label" @update:model-value="add" />
  </div>
</template>

<style scoped>
.games { display: flex; flex-direction: column; gap: 6px; min-width: 0; max-width: 32rem; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
.x { font: inherit; border: 0; background: none; color: var(--vods-muted); cursor: pointer; padding: 0 0 0 4px; }
.x:hover { color: var(--vods-ink); }
</style>
