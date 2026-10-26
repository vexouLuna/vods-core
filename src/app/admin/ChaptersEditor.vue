<script setup lang="ts">
// Hand-edit a VOD's chapters: game (Twitch category search), start / end times, restricted (cut for DMCA). A strip on
// top shows the result against the VOD's length. "Lock" keeps the automatic chapters step from overwriting the edit.
// The logic is useChaptersDraft's; this draws it, with the game colours of the Deep Field palette.
import { gamePalette, useToast } from '@vex/ui/utils'
import { toClock } from '../../index'
import { computed, watch } from 'vue'
import type { AdminVod } from './api'
import EditorRows from './EditorRows.vue'
import GameSearch from './GameSearch.vue'
import TimeInput from './TimeInput.vue'
import TimeStrip from './TimeStrip.vue'
import { useChaptersDraft } from '../composables/useChaptersDraft'

const props = defineProps<{ vod: AdminVod; duration: number }>()
const emit = defineEmits<{ saved: [vod: AdminVod]; draft: [rows: number, dirty: boolean] }>()
const toast = useToast()

const { rows, error, saving, dirty, errors, reset, save, remove, locked, gaps, sorted, label, total, game, setGame, add, split, sortRows } =
  useChaptersDraft(props, { saved: (vod) => emit('saved', vod), notify: (message, options) => toast.show(message, options) })

// The Timeline workbench's tab shows the row count and marks unsaved changes.
watch([() => rows.value.length, dirty], ([n, d]) => emit('draft', n, d), { immediate: true })
const palette = computed(() => gamePalette(rows.value.map(label)))
const segments = computed(() =>
  rows.value.map((r) => ({ ...r, label: label(r), color: palette.value.get(label(r)), bad: errors.value.has(r.key) })),
)
</script>

<template>
  <EditorRows
    class="chapters"
    :rows="rows"
    :errors="errors"
    :error="error"
    error-title="Couldn't save the chapters"
    empty-text="No chapters. Add one, or re-fetch them from Twitch in the actions above."
    :dirty="dirty"
    :saving="saving"
    save-label="Save chapters"
    @undo="reset"
    @save="save"
  >
    <TimeStrip :segments="segments" :total="total" :label="`${rows.length} chapters over ${toClock(total)}`" />
    <template #row="{ row: r, index: i }">
      <span class="n vods-mono vods-muted">{{ i + 1 }}</span>
      <GameSearch class="g" :model-value="game(r)" :label="`chapter ${i + 1}`" @update:model-value="setGame(r, $event)" />
      <div class="times">
        <TimeInput v-model="r.start" seekable :label="`Chapter ${i + 1} start`" :invalid="errors.has(r.key)" />
        <span class="vods-muted" aria-hidden="true">→</span>
        <TimeInput v-model="r.end" seekable :label="`Chapter ${i + 1} end`" :invalid="errors.has(r.key)" />
        <span class="len vods-mono vods-muted" :title="'Length'">{{ Number.isFinite(r.end - r.start) && r.end > r.start ? toClock(r.end - r.start) : '—' }}</span>
      </div>
      <UiChip v-if="r.kind === 'gap'" class="restricted" title="The stream was down here, between two merged Twitch VODs. Undo the merge to remove it.">stream down</UiChip>
      <UiCheckbox v-else v-model="r.restricted" class="restricted">Cut (DMCA)</UiCheckbox>
      <div class="row-actions">
        <UiButton variant="ghost" icon :label="`Split chapter ${i + 1} in two`" @click="split(r)">⋮</UiButton>
        <UiButton variant="ghost" icon :label="`Remove chapter ${i + 1}`" @click="remove(r)">×</UiButton>
      </div>
    </template>
    <template #after>
      <p v-if="gaps.length && rows.length" class="vods-muted small">
        Not covered by any chapter:
        <span v-for="(g, i) in gaps" :key="i" class="vods-mono">{{ i ? ', ' : ' ' }}{{ toClock(g.start) }}–{{ toClock(g.end) }}</span>
      </p>
    </template>
    <template #actions>
      <UiButton @click="add">+ Add chapter</UiButton>
      <UiButton v-if="!sorted" variant="ghost" @click="sortRows">Sort by start</UiButton>
    </template>
    <template #trail>
      <label class="lock"><UiSwitch id="chapters-locked" v-model="locked" /><span>Lock (automatic updates skip this VOD)</span></label>
    </template>
  </EditorRows>
</template>

<style scoped>
.chapters :deep(.vods-editor-row) { display: grid; grid-template-columns: 22px minmax(160px, 1fr) auto auto auto; }
.chapters :deep(.vods-editor-err) { grid-column: 2 / -1; }
.n { font-size: 12px; text-align: right; }
.g { min-width: 0; }
.times { display: flex; align-items: center; gap: 6px; }
.len { font-size: 11px; min-width: 52px; }
.restricted { font-size: 12px; white-space: nowrap; }
.row-actions { display: flex; }
.small { font-size: 12px; margin: 0; }
.lock { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
@container vods (max-width: 760px) {
  .chapters :deep(.vods-editor-row) { grid-template-columns: 22px minmax(0, 1fr) auto; }
  .g { grid-column: 2 / 3; }
  .row-actions { grid-column: 3; grid-row: 1; }
  .times { grid-column: 2 / -1; flex-wrap: wrap; }
  .restricted { grid-column: 2 / -1; }
}
</style>
