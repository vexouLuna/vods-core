<script setup lang="ts">
// /manage/home: the cards the homepage shows, in order (GET /admin/site/options), each with its own settings: a
// "Latest VOD" or "Latest 2" card picks its tag (any home category, or every VOD). The same card can be added twice.
// Which version of a compiled synthetic VOD plays first is on Settings ("Watch page").
import { useToast } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import { computed, onMounted, ref } from 'vue'
import ManageShell from '../../admin/ManageShell.vue'
import { admin } from '../../admin/session'
import {
  homeCardLabel,
  homeCardsOf,
  homeCardTypeLabel,
  homeTagLabel,
  legacyCards,
  newCardId,
  siteOptions,
  toLegacyCards,
  type HomeCard,
  type SiteOptionsView,
} from '../../lib/siteOptions'
import { tagConfig, VODS_TAG } from '../../lib/vodTags'
import { timeAgo } from '../../lib/time'
import { site } from '../../site'
import { moved } from '../../lib/reorder'

const toast = useToast()

const saved = ref<HomeCard[] | null>(null)
const changedAt = ref<{ at: string | null; by: string | null }>({ at: null, by: null })
const cards = ref<HomeCard[]>([])
/** The archive stores the old `{kind, tag}` shape: saves send that (one of each card). */
const legacy = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)

function take(v: SiteOptionsView) {
  legacy.value = legacyCards(v.homeCards)
  saved.value = homeCardsOf(v.homeCards)
  cards.value = saved.value.map((c) => ({ ...c }))
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

/** What "Add a card" offers. */
const TYPES = [
  { value: 'live', label: 'Latest live' },
  { value: 'one', label: 'Latest VOD' },
  { value: 'two', label: 'Latest 2' },
  { value: 'games', label: 'Most played games' },
] as const
type AddType = (typeof TYPES)[number]['value']
const adding = ref<AddType>('one')

/** A tag card's choices: every VOD, then the home categories (tags with a page). */
const tagChoices = computed(() => [VODS_TAG, ...Object.entries(tagConfig.value).filter(([t, s]) => s.page && t !== VODS_TAG).map(([t]) => t)])
/** The choices for a card, its own tag kept even when it's no longer a home category (it isn't shown, but stays saved). */
const choicesFor = (c: HomeCard & { type: 'vods' }) => (tagChoices.value.includes(c.tag) ? tagChoices.value : [...tagChoices.value, c.tag])

const dirty = computed(() => JSON.stringify(cards.value) !== JSON.stringify(saved.value))
const move = (i: number, by: -1 | 1) => (cards.value = moved(cards.value, i, by))
const remove = (i: number) => (cards.value = cards.value.filter((_, j) => j !== i))
function add() {
  const id = newCardId()
  const t = adding.value
  const card: HomeCard =
    t === 'live' || t === 'games' ? { id, type: t === 'live' ? 'live' : 'games' } : { id, type: 'vods', tag: VODS_TAG, count: t === 'one' ? 1 : 2 }
  cards.value = [...cards.value, card]
}
const setTag = (i: number, tag: string) => (cards.value = cards.value.map((c, j) => (j === i && c.type === 'vods' ? { ...c, tag } : c)))

async function save() {
  saving.value = true
  saveError.value = null
  try {
    // shortcut: an archive from before per-card settings takes only the old shape; drop once every archive is past it.
    const homeCards = legacy.value ? toLegacyCards(cards.value) : cards.value
    const v = await admin.saveSiteOptions({ homeCards })
    take(v)
    siteOptions.value = { ...siteOptions.value, homeCards: saved.value! }
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
      The cards on the homepage, top to bottom. "Latest live" is the stream while live, else the newest VOD. "Latest VOD"
      and "Latest 2" show the newest one or two VODs of a tag: every VOD, or a home category (a tag with a page, Tags).
    </p>
    <UiLoadState
      :error="loadError"
      :loading="!saved"
      error-title="Couldn't load the homepage cards"
      :rows="1"
      row-height="160px"
      @retry="load"
    >
      <form class="vods-panel vx-glass-rim panel" @submit.prevent="save">
        <ol v-if="cards.length" class="cards">
          <li v-for="(c, i) in cards" :key="c.id" class="card">
            <span class="n vods-mono">{{ i + 1 }}</span>
            <span class="main">
              <strong>{{ homeCardTypeLabel(c) }}</strong>
              <span v-if="c.type === 'live'" class="vods-muted"> · the stream while live, else the newest VOD</span>
              <span v-else-if="c.type === 'games'" class="vods-muted"> · its most played games</span>
              <span v-else class="tag">
                <label :for="`card-tag-${c.id}`" class="vods-muted">Tag</label>
                <select :id="`card-tag-${c.id}`" :value="c.tag" class="vods-input" @change="setTag(i, ($event.target as HTMLSelectElement).value)">
                  <option v-for="t in choicesFor(c)" :key="t" :value="t">{{ homeTagLabel(t, tagConfig) }}{{ t !== VODS_TAG && !tagConfig[t]?.page ? ' (not a home category: hidden)' : '' }}</option>
                </select>
              </span>
            </span>
            <span class="acts">
              <UiButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move ${homeCardLabel(c, tagConfig)} up`" @click="move(i, -1)">↑</UiButton>
              <UiButton size="sm" variant="ghost" :disabled="i === cards.length - 1" :aria-label="`Move ${homeCardLabel(c, tagConfig)} down`" @click="move(i, 1)">↓</UiButton>
              <UiButton size="sm" variant="ghost" :aria-label="`Remove ${homeCardLabel(c, tagConfig)}`" @click="remove(i)">✕</UiButton>
            </span>
          </li>
        </ol>
        <p v-else class="vods-muted">No cards: the homepage is empty.</p>
        <div class="add">
          <label for="home-add" class="vods-muted">Add a card</label>
          <select id="home-add" v-model="adding" class="vods-input">
            <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <UiButton @click="add">Add</UiButton>
        </div>
        <UiCallout v-if="legacy" tone="info">This archive keeps one of each card: a card added twice is saved once.</UiCallout>
        <UiCallout v-if="saveError" tone="error" title="Couldn't save">{{ saveError }}</UiCallout>
        <div class="actions">
          <UiButton type="submit" variant="primary" :disabled="!dirty" :loading="saving">Save</UiButton>
          <UiButton variant="ghost" :disabled="!dirty" @click="cards = (saved ?? []).map((c) => ({ ...c }))">Undo</UiButton>
          <span v-if="changedAt.at" class="vods-muted">Saved {{ timeAgo(changedAt.at) }}{{ changedAt.by ? ` by ${changedAt.by}` : '' }}</span>
        </div>
      </form>
    </UiLoadState>
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 12px; }
.panel { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.card { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px 0; border-top: 1px solid var(--vods-line); }
.card:first-child { border-top: 0; }
.n { min-width: 1.5em; opacity: 0.6; }
.main { flex: 1 1 16rem; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.tag { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.tag select { max-width: 100%; }
.acts { display: flex; gap: 2px; margin-left: auto; }
.add { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
