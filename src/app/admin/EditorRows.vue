<script setup lang="ts" generic="Row extends { key: number }">
// The frame every VOD draft editor shares (useDraftEditor): what's above the list (default slot), the rows with each
// one's problem under it, the save error, and the foot: the editor's own buttons (`#actions`), `#trail`, Undo and Save.
// A row's layout is the editor's: it styles `:deep(.vods-editor-row)`.
withDefaults(
  defineProps<{
    rows: Row[]
    errors: Map<number, string>
    error: string | null
    /** "Couldn't save the …". */
    errorTitle: string
    /** Shown when there are no rows. */
    emptyText: string
    dirty: boolean
    saving: boolean
    saveLabel?: string
    /** More classes for a row (e.g. the one being edited). */
    rowClass?: (row: Row) => string | Record<string, boolean> | undefined
  }>(),
  { saveLabel: 'Save' },
)
defineEmits<{ undo: []; save: [] }>()
defineSlots<{
  default?: () => unknown
  row: (p: { row: Row; index: number }) => unknown
  after?: () => unknown
  actions?: () => unknown
  trail?: () => unknown
}>()
</script>

<template>
  <div class="vods-editor">
    <slot></slot>
    <p v-if="!rows.length" class="vods-muted empty">{{ emptyText }}</p>
    <ol class="rows">
      <li
        v-for="(r, i) in rows"
        :key="r.key"
        class="vods-editor-row"
        :class="[rowClass?.(r), { 'has-error': errors.has(r.key) }]"
      >
        <slot name="row" :row="r" :index="i"></slot>
        <p v-if="errors.has(r.key)" class="vods-editor-err">{{ errors.get(r.key) }}</p>
      </li>
    </ol>
    <slot name="after"></slot>
    <UiCallout v-if="error" tone="error" :title="errorTitle">{{ error }}</UiCallout>
    <div class="foot">
      <slot name="actions"></slot>
      <span class="spacer" />
      <slot name="trail"></slot>
      <UiButton :disabled="!dirty || saving" @click="$emit('undo')">Undo changes</UiButton>
      <UiButton variant="primary" :loading="saving" :disabled="!dirty || errors.size > 0" @click="$emit('save')">{{ saveLabel }}</UiButton>
    </div>
  </div>
</template>

<style scoped>
.vods-editor { display: flex; flex-direction: column; gap: 10px; }
.empty { margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.vods-editor-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 8px;
  border-radius: var(--vods-radius); background: rgb(255 255 255 / 0.03);
}
.vods-editor-row.has-error { box-shadow: inset 0 0 0 1px var(--vods-bad); }
.vods-editor-err { flex-basis: 100%; grid-column: 1 / -1; margin: 0; color: var(--vods-bad); font-size: 12px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1; }
@container vods (max-width: 760px) {
  .spacer { display: none; }
}
</style>
