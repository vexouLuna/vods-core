<script setup lang="ts">
// A VOD time as text ("1:02:03", "1h2m3s" or seconds). Commits on blur / Enter; unreadable text is flagged, not kept.
// `seekable`, under Manage → VOD's preview: buttons to take the preview's playhead and to jump the preview there.
import { computed, ref, watch } from 'vue'
import { formatTime, parseTime } from './edits'
import { seekTo, usePreview } from './preview/previewState'

const props = defineProps<{ id?: string; invalid?: boolean; label?: string; placeholder?: string; optional?: boolean; seekable?: boolean }>()
const preview = props.seekable ? usePreview() : null
const ready = computed(() => !!preview?.ready.value)
const model = defineModel<number | null>({ required: true })
const text = ref(model.value == null ? '' : formatTime(model.value))
const bad = ref(false)

watch(model, (v) => {
  const shown = parseTime(text.value)
  if (v == null ? text.value !== '' : shown !== v) text.value = v == null ? '' : formatTime(v)
  bad.value = false
})

function commit() {
  if (props.optional && !text.value.trim()) {
    bad.value = false
    model.value = null
    return
  }
  const s = parseTime(text.value)
  bad.value = !Number.isFinite(s)
  if (!bad.value) {
    model.value = s
    text.value = formatTime(s)
  }
}
</script>

<template>
  <span v-if="preview" class="seekable">
    <UiInput
      :id="id"
      v-model="text"
      class="time"
      mono
      :invalid="bad || invalid"
      :placeholder="placeholder ?? '0:00:00'"
      :aria-label="label"
      @blur="commit"
      @keydown.enter.prevent="commit"
    />
    <UiButton size="sm" variant="ghost" icon :disabled="!ready" :label="`${label ?? 'Time'}: set from the preview's playhead`" :title="'Set from the playhead'" @click="model = Math.round(preview.time.value * 1000) / 1000">⤓</UiButton>
    <UiButton size="sm" variant="ghost" icon :disabled="!ready || model == null" :label="`${label ?? 'Time'}: jump the preview here`" :title="'Jump the preview here'" @click="model != null && seekTo(preview, model)">▸</UiButton>
  </span>
  <UiInput
    v-else
    :id="id"
    v-model="text"
    class="time"
    mono
    :invalid="bad || invalid"
    :placeholder="placeholder ?? '0:00:00'"
    :aria-label="label"
    @blur="commit"
    @keydown.enter.prevent="commit"
  />
</template>

<style scoped>
.time { width: 108px; }
.seekable { display: inline-flex; align-items: center; gap: 2px; }
</style>
