<script setup lang="ts">
// Tag filter for the list page: the tags the open tab can be narrowed to (lib/listQuery, tagFilters), each drawn as
// on the thumbnails at 2/3 size, or smaller if it wouldn't fit beside the text. Empty value = any tag.
import { computed } from 'vue'
import TagMark from './TagMark.vue'
import { tagFilters, type Tab } from '../lib/listQuery'
import { fitMark } from '../lib/tagShape'
import { DATE_TAGS, tagConfig, tagStyle } from '../lib/vodTags'
import type { TagStyle } from '../site'

const props = defineProps<{ tab: Tab }>()
const model = defineModel<string>({ required: true })

const tags = computed(() =>
  [...new Set([...DATE_TAGS, ...Object.keys(tagConfig.value)])]
    .filter((name) => tagFilters(props.tab, name))
    .map((name) => ({ name, ...tagStyle(name) })),
)
const current = computed(() => (model.value ? tagStyle(model.value) : null))

/** The tag at 2/3 size at most, turned as on the thumbnails, fitted to `.mark`'s 44×18 so it lines up with the text. */
function fit(t: TagStyle) {
  const { scale, x, y } = fitMark(t, { w: 44, h: 18 }, 0.66)
  return { transform: `translate(${x}px, ${y}px) scale(${scale})` }
}

function pick(name: string, close: () => void) {
  model.value = name
  close()
}
</script>

<template>
  <UiPopover width="min(260px, calc(100vw - 24px))" :cap="400">
    <template #trigger="{ toggle, open }">
      <UiButton class="trigger" :pressed="open || !!model" :label="current ? `Tag: ${current.label}` : 'Tag: any'" @click="toggle">
        <span v-if="current" class="mark"><span class="fit" :style="fit(current)"><TagMark :tag="current" /></span></span>
        <span class="label">{{ current?.label ?? 'Any tag' }}</span>
        <span aria-hidden="true">▾</span>
      </UiButton>
    </template>
    <template #default="{ close }">
      <UiMenuItem :current="!model" @click="pick('', close)">Any tag</UiMenuItem>
      <UiMenuItem v-for="t in tags" :key="t.name" :current="t.name === model" @click="pick(t.name, close)">
        <template #lead><span class="mark"><span class="fit" :style="fit(t)"><TagMark :tag="t" /></span></span></template>
        {{ t.label }}
      </UiMenuItem>
    </template>
  </UiPopover>
</template>

<style scoped>
.trigger { max-width: 220px; }
.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Its text can be nudged off the tag: clipped here, so it never reaches the label. */
.mark { flex: none; display: block; position: relative; width: 44px; height: 18px; overflow: clip; }
.fit { position: absolute; top: 0; left: 0; display: flex; transform-origin: 0 0; }
</style>
