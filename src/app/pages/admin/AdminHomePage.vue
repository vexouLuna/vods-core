<script setup lang="ts">
// /manage/home: which cards the homepage shows, in order (GET /admin/site/options). A tag card is any tag whose type
// can be a home card (/manage/tags). One Save sends the list.
import { useToast } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import { computed, onMounted, ref } from 'vue'
import ManageShell from '../../admin/ManageShell.vue'
import { admin } from '../../admin/session'
import { homeCardKey, homeCardLabel, siteOptions, type HomeCard } from '../../lib/siteOptions'
import { tagConfig } from '../../lib/vodTags'
import { timeAgo } from '../../lib/time'
import { site } from '../../site'

const toast = useToast()

const saved = ref<HomeCard[] | null>(null)
const changedAt = ref<{ at: string | null; by: string | null }>({ at: null, by: null })
const cards = ref<HomeCard[]>([])
const loadError = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const adding = ref('')

function take(v: { homeCards: HomeCard[]; updatedAt: string | null; updatedBy: string | null }) {
  saved.value = v.homeCards
  cards.value = [...v.homeCards]
  changedAt.value = { at: v.updatedAt, by: v.updatedBy }
}
async function load() {
  loadError.value = null
  try {
    take(await admin.siteOptions())
  } catch (e) {
    loadError.value = errorText(e)
  }
}

/** Cards not on the homepage yet: the latest VOD, the games, and each tag that can be a home card. */
const addable = computed(() => {
  const all: HomeCard[] = [
    { kind: 'latest' },
    ...Object.entries(tagConfig.value).flatMap(([tag, s]) => (s.homeCard ? [{ kind: 'tag' as const, tag }] : [])),
    { kind: 'games' },
  ]
  const have = new Set(cards.value.map(homeCardKey))
  return all.filter((c) => !have.has(homeCardKey(c)))
})
const dirty = computed(() => JSON.stringify(cards.value) !== JSON.stringify(saved.value))

function move(i: number, by: -1 | 1) {
  const next = [...cards.value]
  ;[next[i], next[i + by]] = [next[i + by]!, next[i]!]
  cards.value = next
}
function add() {
  const card = addable.value.find((c) => homeCardKey(c) === adding.value)
  if (card) cards.value = [...cards.value, card]
  adding.value = ''
}

async function save() {
  saving.value = true
  saveError.value = null
  try {
    const v = await admin.saveSiteOptions({ homeCards: cards.value })
    take(v)
    siteOptions.value = { homeCards: v.homeCards }
    toast.show('Homepage saved', { duration: 3000 })
  } catch (e) {
    saveError.value = errorText(e)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  document.title = `Homepage · Manage · ${site.name}`
  void load()
})
</script>

<template>
  <ManageShell title="Homepage">
    <p class="intro vods-muted">
      The cards on the homepage, top to bottom. A tag's card shows its newest VODs; a tag gets one when its type can be a
      home card (Tags).
    </p>
    <UiCallout v-if="loadError" tone="error" title="Couldn't load the homepage cards">
      {{ loadError }}
      <template #actions><UiButton size="sm" @click="load">Try again</UiButton></template>
    </UiCallout>
    <div v-else-if="!saved" class="sk" aria-busy="true"><UiSkeleton h="160px" /></div>
    <form v-else class="vods-panel panel" @submit.prevent="save">
      <ol v-if="cards.length" class="cards">
        <li v-for="(c, i) in cards" :key="homeCardKey(c)" class="card">
          <span class="name">{{ homeCardLabel(c, tagConfig) }}</span>
          <UiButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move ${homeCardLabel(c, tagConfig)} up`" @click="move(i, -1)">↑</UiButton>
          <UiButton size="sm" variant="ghost" :disabled="i === cards.length - 1" :aria-label="`Move ${homeCardLabel(c, tagConfig)} down`" @click="move(i, 1)">↓</UiButton>
          <UiButton size="sm" variant="ghost" @click="cards = cards.filter((_, j) => j !== i)">Remove</UiButton>
        </li>
      </ol>
      <p v-else class="vods-muted">No cards: the homepage is empty.</p>
      <div v-if="addable.length" class="add">
        <label for="home-add" class="vods-muted">Add a card</label>
        <select id="home-add" v-model="adding" class="vods-input" @change="add">
          <option value="" disabled>Choose…</option>
          <option v-for="c in addable" :key="homeCardKey(c)" :value="homeCardKey(c)">{{ homeCardLabel(c, tagConfig) }}</option>
        </select>
      </div>
      <UiCallout v-if="saveError" tone="error" title="Couldn't save">{{ saveError }}</UiCallout>
      <div class="actions">
        <UiButton type="submit" :disabled="!dirty" :loading="saving">Save</UiButton>
        <UiButton variant="ghost" :disabled="!dirty" @click="cards = [...(saved ?? [])]">Undo</UiButton>
        <span v-if="changedAt.at" class="vods-muted">Saved {{ timeAgo(changedAt.at) }}{{ changedAt.by ? ` by ${changedAt.by}` : '' }}</span>
      </div>
    </form>
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 12px; }
.panel { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card { display: flex; align-items: center; gap: 6px; }
.name { flex: 1; min-width: 0; }
.add { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
