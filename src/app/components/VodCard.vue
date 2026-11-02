<script setup lang="ts">
// One VOD in the list: YouTube thumbnail with duration, fanned game posters (a button: opens the chapters, each a
// link to that point), chapter strip, and where you stopped (from watch progress) with a bar showing how much
// you've seen. Thumbnail and title link to the VOD; the posters sit outside those links. A tagged VOD (a playthrough)
// shows its tags by the date as chips, or hanging off the thumbnail (ThumbTags), as `site.tags` says. The headline is
// the stream's title or one made from its date and games (lib/vodTitle); with the latter, the stream's title moves to the
// small line. A VOD cut in full is dimmed, says so where the picture would be, and has no length or NEW stamp.
import { gamePalette, learnGameColors } from '@vex/ui/utils'
import { boxArt, isFinished, toClock, watchPath, type Progress, type Vod } from '../../index'
import { computed, ref, watchEffect } from 'vue'
import { useThumbnail } from '../composables/useThumbnail'
import NoThumbnail from './NoThumbnail.vue'
import { cutInFull, cutNote } from '../lib/cuts'
import { titleIsGenerated, vodTitle } from '../lib/vodTitle'
import { gamesWithArt } from '../lib/art'
import { DATE_TAGS, splitTags, tagStyle } from '../lib/vodTags'
import ThumbTags from './ThumbTags.vue'
import ManageVodButton from './ManageVodButton.vue'

// `compact`: no line under the title (where the card sits beside its own details).
const props = defineProps<{ vod: Vod; progress?: Progress | null; compact?: boolean }>()

// One palette for this VOD's posters, chapter strip and chapter list, so similar games get told apart the same way.
const palette = computed(() => gamePalette(props.vod.chapters.map((c) => c.name)))
const games = computed(() => gamesWithArt(props.vod.chapters).map((g) => ({ ...g, color: palette.value.get(g.name) })))
watchEffect(() => learnGameColors(games.value))
const date = computed(() =>
  props.vod.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
)
const to = computed(() => watchPath(props.vod, props.progress?.t))
// Finished before the VOD grew (a playthrough's new stream): `t` is where the new part starts.
const grown = computed(() => !!props.progress && isFinished(props.progress))
const watched = computed(() => (props.progress && props.vod.duration ? Math.min(1, props.progress.t / props.vod.duration) : 0))
const postersOpen = ref(false)
const title = computed(() => vodTitle(props.vod))
const generated = computed(() => titleIsGenerated(props.vod))
const cut = computed(() => cutInFull(props.vod))
const chips = computed(() =>
  splitTags(props.vod).chips.filter((name) => !(cut.value && DATE_TAGS.includes(name))).map((name) => ({ name, ...tagStyle(name) })),
)

const { src: thumb, srcset: thumbSet, onLoad: thumbLoaded, onError: thumbFailed } = useThumbnail(() => props.vod, 'hidpi')
</script>

<template>
  <article class="card" :class="{ 'is-cut': cut }">
    <div class="thumb">
      <UiLink :to="to" class="thumb-link" :aria-label="title" tabindex="-1">
        <div class="vods-ring img">
          <div v-if="cut" class="cut-slate"><span class="vods-display">Cut</span><small>Not on YouTube</small></div>
          <img v-else-if="thumb" :src="thumb" :srcset="thumbSet" alt="" loading="lazy" decoding="async" @load="thumbLoaded" @error="thumbFailed" />
          <NoThumbnail v-else flush />
        </div>
        <span v-if="!cut" class="dur vods-mono">{{ toClock(vod.duration) }}</span>
        <template v-if="progress">
          <span
            class="resume vods-mono"
            :title="grown ? `New since you finished it, from ${toClock(progress.t)}. Opens the VOD right there.` : `You stopped at ${toClock(progress.t)}. Opens the VOD right there.`"
          >
            ▶ {{ grown ? 'New ' : '' }}{{ toClock(progress.t) }}
          </span>
          <span class="watched" :style="{ width: `${watched * 100}%` }"></span>
        </template>
        <UiChapterBar v-if="vod.chapters.length" class="chapters" :chapters="vod.chapters" :palette="palette" />
      </UiLink>
      <ThumbTags :vod="vod" :no-dates="cut" class="tags" />
      <ManageVodButton :id="vod.id" class="manage" />

      <UiPopover v-if="games.length" class="posters" :class="{ 'is-open': postersOpen }" @open="postersOpen = true" @close="postersOpen = false" width="min(320px, calc(100vw - 24px))" :cap="340">
        <template #trigger="{ toggle, open }">
          <button
            type="button"
            class="poster-btn"
            :class="{ open }"
            :aria-label="`Chapters: ${games.map((g) => g.name).join(', ')}`"
            :aria-expanded="open"
            @click="toggle"
          >
            <UiPosters :games="games" mode="fan" :size="30" />
          </button>
        </template>
        <template #default="{ close }">
          <div class="vods-eyebrow menu-head">Chapters · {{ vod.chapters.length }}</div>
          <UiMenuItem
            v-for="(c, i) in vod.chapters"
            :key="i"
            :to="c.restricted ? undefined : watchPath(vod, c.start)"
            :disabled="c.restricted"
            :sub="toClock(c.start)"
            @click="close()"
          >
            <template #lead>
              <UiPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="24" />
            </template>
            {{ c.name }}
            <template v-if="cutNote(c)" #trail><UiChip :title="cutNote(c)!.title">{{ cutNote(c)!.label }}</UiChip></template>
          </UiMenuItem>
        </template>
      </UiPopover>
    </div>

    <UiLink :to="to" class="text">
      <span class="title">{{ title }}</span>
      <span v-if="!compact" class="meta">
        <span v-if="!generated" class="vods-mono date">{{ date }}</span>
        <UiChip v-for="t in chips" :key="t.name" class="tag" :style="t.color ? { color: t.color, borderColor: t.color } : undefined">{{ t.label }}</UiChip>
        <span v-if="generated" class="games">{{ vod.title ? `“${vod.title}”` : '' }}</span>
        <span v-else-if="games.length" class="games">{{ games.map((g) => g.name).join(', ') }}</span>
      </span>
    </UiLink>
  </article>
</template>

<style scoped>
.card { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.thumb { position: relative; }
.thumb-link { display: block; position: relative; color: inherit; text-decoration: none; }
.img { border-radius: var(--vods-radius); overflow: hidden; aspect-ratio: 16 / 9; background: var(--vods-surface); }
.img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dur, .resume {
  position: absolute; top: 6px; font-size: 11px; padding: 0 6px; border-radius: var(--vods-radius-sm);
  background: rgb(0 0 0 / 0.75);
}
.dur { right: 6px; color: #fff; }
.resume { left: 6px; color: var(--vods-accent); }
.watched { position: absolute; left: 0; bottom: 3px; height: 3px; background: var(--vods-accent); z-index: 1; }
.chapters { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 0 0 var(--vods-radius) var(--vods-radius); overflow: hidden; }
.tags { position: absolute; left: -5px; top: 30px; z-index: 1; }
/* Off the thumbnail's top corner; it may cover the end of a long duration. */
.manage { top: -9px; right: -9px; }
.posters { position: absolute; left: 8px; bottom: 10px; z-index: 2; }
/* An open chapter list must cover the cards below it (their posters sit at the same level). */
.posters.is-open { z-index: 30; }
.poster-btn {
  display: flex; padding: 2px 4px; margin: -2px -4px; background: none; border: none; cursor: pointer;
  border-radius: var(--vods-radius-sm); color: inherit;
}
.poster-btn:hover, .poster-btn.open { filter: brightness(1.15); }
.poster-btn:focus-visible { outline: 2px solid var(--vods-accent); outline-offset: 2px; }
.menu-head { padding: 6px 8px; }
.text { min-width: 0; display: flex; flex-direction: column; gap: 3px; color: inherit; text-decoration: none; }
.title { color: var(--vods-ink); font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.text:hover .title, .text:focus-visible .title, .card:has(.thumb-link:hover) .title { color: var(--vods-accent); }
/* Baseline, not center: the mono date and the sans names (and a chip's text) sit on one line at any display scaling. */
.meta { display: flex; gap: 6px; align-items: baseline; min-width: 0; font-size: 12px; color: var(--vods-muted); }
.date, .tag { white-space: nowrap; flex: none; }
.games { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date + .games::before, .tag + .games::before { content: '·'; margin-right: 6px; }
/* Nothing to play: the card steps back, and says why where the picture would be. */
.is-cut .img, .is-cut .chapters, .is-cut .posters { opacity: 0.55; }
.is-cut .title { color: var(--vods-muted); }
.cut-slate {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  color: var(--vods-muted); background: var(--vods-surface);
}
.cut-slate .vods-display { font-size: 28px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--vods-ink); }
.cut-slate small { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
</style>
