<script setup lang="ts">
// Hand-edit a VOD's games rows: which game was played when, as the games pages list them (not the chapters). Laid out
// like ChaptersEditor; "Copy from chapters" starts the rows from the chapters when a VOD has none.
import { gamePalette, useToast } from '@vex/ui/utils'
import { toClock } from '../../index'
import { computed, ref, watch } from 'vue'
import { errorText } from '@vex/platform-web'
import type { AdminVod, GameRow } from './api'
import { gameDrafts, gameEdits, gameErrors, gamesFromChapters, newGame, type GameDraft, type GameValue } from './edits'
import EditorRows from './EditorRows.vue'
import GameSearch from './GameSearch.vue'
import { admin } from './session'
import TimeInput from './TimeInput.vue'
import TimeStrip from './TimeStrip.vue'
import { useDraftEditor } from './useDraftEditor'

const props = defineProps<{ vod: AdminVod; duration: number }>()
const emit = defineEmits<{ saved: [vod: AdminVod]; dirty: [dirty: boolean] }>()
const toast = useToast()

const loaded = ref<GameRow[] | null>(null)
const loadError = ref<string | null>(null)
async function load() {
  loadError.value = null
  try {
    loaded.value = await admin.games(props.vod.id)
  } catch (e) {
    loadError.value = errorText(e)
  }
}
watch(() => props.vod.id, load, { immediate: true })

const { rows, error, saving, dirty, errors, reset, save, remove } = useDraftEditor<GameDraft>({
  source: () => loaded.value,
  drafts: () => gameDrafts(loaded.value),
  edits: gameEdits,
  validate: (rows) => gameErrors(rows, props.duration),
  async save(rows) {
    const edits = gameEdits(rows)
    const vod = await admin.saveGames(props.vod.id, edits)
    loaded.value = await admin.games(props.vod.id).catch(() => edits)
    toast.show('Games saved', { duration: 3000 })
    emit('saved', vod)
  },
})

// The Timeline workbench marks the tab of an editor with unsaved changes.
watch(dirty, (d) => emit('dirty', d))

const sorted = computed(() => rows.value.every((r, i) => i === 0 || rows.value[i - 1]!.start <= r.start))

const label = (r: GameDraft) => r.name ?? '?'
const palette = computed(() => gamePalette(rows.value.map(label)))
const total = computed(() => Math.max(props.duration, ...rows.value.map((r) => (Number.isFinite(r.end) ? r.end : 0)), 1))
const segments = computed(() =>
  rows.value.map((r) => ({ ...r, label: label(r), color: palette.value.get(label(r)), bad: errors.value.has(r.key) })),
)

const game = (r: GameDraft): GameValue => ({ name: r.name, gameId: r.gameId, imageTemplate: r.imageTemplate })
function setGame(r: GameDraft, g: GameValue) {
  r.name = g.name
  r.gameId = g.gameId
  r.imageTemplate = g.imageTemplate
}
const add = () => rows.value.push(newGame(rows.value, props.duration))
const fromChapters = () => (rows.value = gamesFromChapters(props.vod.chapters))
const sortRows = () => (rows.value = [...rows.value].sort((a, b) => a.start - b.start))
</script>

<template>
  <div class="games">
    <UiLoadState
      :error="loadError"
      :loading="!loaded"
      error-title="Couldn't load the games"
      :rows="1"
      row-height="60px"
      @retry="load"
    >
      <EditorRows
        :rows="rows"
        :errors="errors"
        :error="error"
        error-title="Couldn't save the games"
        empty-text="No games rows: this VOD isn't on any game's page. Add one, or copy them from the chapters."
        :dirty="dirty"
        :saving="saving"
        save-label="Save games"
        @undo="reset"
        @save="save"
      >
        <TimeStrip :segments="segments" :total="total" :label="`${rows.length} games over ${toClock(total)}`" />
        <template #row="{ row: r, index: i }">
          <span class="n vods-mono vods-muted">{{ i + 1 }}</span>
          <GameSearch class="g" :model-value="game(r)" :label="`games row ${i + 1}`" :invalid="!r.name" @update:model-value="setGame(r, $event)" />
          <div class="times">
            <TimeInput v-model="r.start" seekable :label="`Games row ${i + 1} start`" :invalid="errors.has(r.key)" />
            <span class="vods-muted" aria-hidden="true">→</span>
            <TimeInput v-model="r.end" seekable :label="`Games row ${i + 1} end`" :invalid="errors.has(r.key)" />
            <span class="len vods-mono vods-muted" title="Length">{{ Number.isFinite(r.end - r.start) && r.end > r.start ? toClock(r.end - r.start) : '—' }}</span>
          </div>
          <UiButton class="rm" variant="ghost" icon :label="`Remove games row ${i + 1}`" @click="remove(r)">×</UiButton>
        </template>
        <template #actions>
          <UiButton @click="add">+ Add row</UiButton>
          <UiButton variant="ghost" :disabled="!vod.chapters?.length" @click="fromChapters">Copy from chapters</UiButton>
          <UiButton v-if="!sorted" variant="ghost" @click="sortRows">Sort by start</UiButton>
        </template>
      </EditorRows>
    </UiLoadState>
  </div>
</template>

<style scoped>
.games :deep(.vods-editor-row) { display: grid; grid-template-columns: 22px minmax(160px, 1fr) auto auto; }
.games :deep(.vods-editor-err) { grid-column: 2 / -1; }
.n { font-size: 12px; text-align: right; }
.g { min-width: 0; }
.times { display: flex; align-items: center; gap: 6px; }
.len { font-size: 11px; min-width: 52px; }
@container vods (max-width: 760px) {
  .games :deep(.vods-editor-row) { grid-template-columns: 22px minmax(0, 1fr) auto; }
  .times { grid-column: 2 / -1; flex-wrap: wrap; }
  .rm { grid-column: 3; grid-row: 1; }
}
</style>
