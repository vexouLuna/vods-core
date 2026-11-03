<script setup lang="ts">
// The player's volume: a small window above the button with a vertical slider, over the bar so the row never moves.
// With a mouse it opens on hover (or keyboard focus) and the button mutes; Esc closes it. A touch screen has no hover,
// so there the button opens it as a popover (closed by Esc or a tap outside).
import { ref } from 'vue'

defineProps<{ volume: number; muted: boolean }>()
const emit = defineEmits<{ volume: [volume: number]; mute: [] }>()

const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches
const open = ref(false)
const root = ref<HTMLElement>()
function blur(e: FocusEvent) {
  if (!root.value?.contains(e.relatedTarget as Node | null)) open.value = false
}
</script>

<template>
  <UiPopover v-if="touch" prefer="up" width="64px" role="dialog">
    <template #trigger="{ toggle, open: shown }">
      <UiButton icon :label="muted ? 'Volume: muted' : `Volume: ${volume}%`" :pressed="shown" @click="toggle"><UiIcon :name="muted ? 'mute' : 'volume'" /></UiButton>
    </template>
    <div class="vol">
      <span class="vods-mono pct">{{ muted ? 'muted' : `${volume}%` }}</span>
      <div class="vol-track">
        <UiSlider :model-value="muted ? 0 : volume" :min="0" :max="100" :step="5" label="Volume" class="vol-slider" @update:model-value="emit('volume', $event)" />
      </div>
      <UiButton icon size="sm" variant="ghost" :label="muted ? 'Unmute' : 'Mute'" :pressed="muted" @click="emit('mute')">
        <UiIcon :name="muted ? 'mute' : 'volume'" />
      </UiButton>
    </div>
  </UiPopover>
  <div
    v-else
    ref="root"
    class="vol-hover"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="blur"
    @keydown.esc="open = false"
  >
    <div v-show="open" class="vol-window">
      <div class="vol">
        <span class="vods-mono pct">{{ muted ? 'muted' : `${volume}%` }}</span>
        <div class="vol-track">
          <UiSlider :model-value="muted ? 0 : volume" :min="0" :max="100" :step="5" label="Volume" class="vol-slider" @update:model-value="emit('volume', $event)" />
        </div>
      </div>
    </div>
    <UiButton icon :label="muted ? 'Unmute (m)' : 'Mute (m)'" @click="emit('mute')"><UiIcon :name="muted ? 'mute' : 'volume'" /></UiButton>
  </div>
</template>

<style scoped>
.vol { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0 4px; }
.pct { font-size: 11px; }
/* UiSlider has no vertical form: a horizontal one turned a quarter, in a box its turned size. */
.vol-track { position: relative; width: 28px; height: 120px; }
/* Under .vol-track so a site's own slider width (often 100%) doesn't win. */
.vol-track .vol-slider { position: absolute; left: 50%; top: 50%; width: 120px; transform: translate(-50%, -50%) rotate(-90deg); }
.vol-hover { position: relative; display: flex; }
/* Out of the row's layout, above the button; its bottom padding bridges the gap so the hover holds on the way up. */
.vol-window { position: absolute; bottom: 100%; left: 50%; z-index: 5; transform: translateX(-50%); padding-bottom: 6px; }
/* Drawn from tokens, not .vods-pop: a site may make that a fixed, teleported overlay. */
.vol-window .vol {
  width: 48px; padding-bottom: 8px; background: var(--vods-pop); border: 1px solid var(--vods-line); border-radius: var(--vods-radius);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
}
</style>
