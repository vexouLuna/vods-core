<script setup lang="ts">
// The "Latest VOD" homepage card: a tag's newest VOD in the big panel (LatestVod), never the live stream. Hidden while
// there is none.
import type { Progress, Vod } from '../../index'
import { computed } from 'vue'
import { useVods } from '../../vue/index'
import LatestVod from './LatestVod.vue'
import { tagConfig } from '../lib/vodTags'

const props = defineProps<{ tag: string; resume: (v: Vod) => Progress | null | undefined }>()

const { vods } = useVods(() => ({ tag: props.tag, page: 1, perPage: 1 }))
const vod = computed(() => vods.value[0] ?? null)
const all = computed(() => {
  const s = tagConfig.value[props.tag]
  return s?.page ? { to: `/${s.page}`, label: s.pageLabel || s.page } : undefined
})
</script>

<template>
  <LatestVod v-if="vod" :vod="vod" :progress="resume(vod)" :all="all" />
</template>
