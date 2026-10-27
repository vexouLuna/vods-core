<script setup lang="ts">
// A VOD's rows (chapters, censor) as coloured stretches over its length, with 0:00 and the end under it. Restricted
// stretches are hatched; a row with a problem is outlined.
import { clamp } from '@vex/ui/utils'
import { toClock } from '../../index'

export interface StripSegment {
  key: number
  start: number
  end: number
  label: string
  color?: string
  restricted?: boolean
  bad?: boolean
}

const props = defineProps<{ segments: StripSegment[]; total: number; label: string }>()
const pct = (s: number) => `${(clamp(s, 0, props.total) / props.total) * 100}%`
</script>

<template>
  <div>
    <div class="strip" role="img" :aria-label="label">
      <span
        v-for="s in segments"
        :key="s.key"
        class="seg"
        :class="{ 'is-restricted': s.restricted, 'is-bad': s.bad }"
        :style="{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})`, backgroundColor: s.color }"
        :title="`${s.label} · ${toClock(s.start)}–${toClock(s.end)}`"
      />
    </div>
    <div class="strip-scale vods-mono vods-muted"><span>0:00</span><span>{{ toClock(total) }}</span></div>
  </div>
</template>

<style scoped>
.strip { position: relative; height: 14px; border-radius: 3px; background: var(--vods-line); overflow: hidden; }
.seg { position: absolute; top: 0; bottom: 0; border-right: 1px solid var(--vods-bg); box-sizing: border-box; }
.seg.is-restricted { background-image: var(--vods-hatch-dark); }
.seg.is-bad { outline: 2px solid var(--vods-bad); outline-offset: -2px; }
.strip-scale { display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; }
</style>
