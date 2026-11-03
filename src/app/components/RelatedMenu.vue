<script setup lang="ts">
// The watch page's related VODs, as menu rows: a playthrough's streams (seek to one, or open its original VOD) and the
// playthroughs a VOD is in. WatchView puts it in its own menu, or on phones in the part picker's.
import { watchPath } from '../../index'
import type { useWatchView } from '../composables/useWatchView'
import { kindLabel } from '../lib/listQuery'

type View = ReturnType<typeof useWatchView>
defineProps<{ madeOf: View['madeOf']['value']; currentStream: number; appearsIn: View['appearsIn']['value'] }>()
const emit = defineEmits<{ seek: [t: number]; close: [] }>()
</script>

<template>
  <template v-if="madeOf.length">
    <div class="vods-eyebrow menu-head">Streams · {{ madeOf.length }}</div>
    <div v-for="(m, i) in madeOf" :key="m.key" class="stream-row">
      <UiMenuItem :current="i === currentStream" :sub="m.sub" :title="`${m.title} · ${m.range}`" @click="emit('seek', m.at); emit('close')">
        <template #lead><span class="smark vods-mono" :class="{ 'is-current': i === currentStream }">{{ m.mark }}</span></template>
        {{ m.title }}
      </UiMenuItem>
      <UiButton icon size="sm" variant="ghost" :to="m.original" label="Open the original VOD" @click="emit('close')"><UiIcon name="external" /></UiButton>
    </div>
  </template>
  <template v-if="appearsIn.length">
    <div class="vods-eyebrow menu-head">Also in</div>
    <UiMenuItem v-for="a in appearsIn" :key="a.id" :to="watchPath({ id: a.id, uploads: [] })" :sub="kindLabel(a.tags)" @click="emit('close')">
      {{ a.title || a.id }}
    </UiMenuItem>
  </template>
</template>

<style scoped>
.menu-head { padding: 6px 8px; }
.stream-row { display: flex; align-items: center; gap: 2px; }
.stream-row > :first-child { flex: 1; min-width: 0; }
.smark { font-size: 11px; color: var(--vods-muted); min-width: 2.5ch; }
.smark.is-current { color: var(--vods-accent); }
</style>
