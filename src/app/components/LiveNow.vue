<script setup lang="ts">
// In the latest VOD's place while the channel is live: Twitch's preview of the stream (a link to the channel) with a
// LIVE tag, its title and game, how long it's been on, and the archive's VOD page for it once there is one.
import { boxArt, toClock, watchPath, type LiveStatus } from '../../index'
import { computed, onUnmounted, ref } from 'vue'
import SeeAllButton from './SeeAllButton.vue'
import ManageVodButton from './ManageVodButton.vue'
import { site, vodsConfig } from '../site'

const props = defineProps<{ live: LiveStatus }>()

// Ticks once a minute: the "live for" clock and a fresh preview (Twitch updates it every few minutes).
const minute = ref(Math.floor(Date.now() / 60000))
const tick = setInterval(() => (minute.value = Math.floor(Date.now() / 60000)), 60000)
onUnmounted(() => clearInterval(tick))

const thumb = computed(
  () => `https://static-cdn.jtvnw.net/previews-ttv/live_user_${vodsConfig.channel.toLowerCase()}-640x360.jpg?t=${minute.value}`,
)
const title = computed(() => props.live.title || props.live.vod?.title || 'Live now')
const since = computed(() =>
  props.live.startedAt ? toClock(Math.max(0, minute.value * 60 - Math.floor(props.live.startedAt.getTime() / 1000))) : null,
)
const art = computed(() => (props.live.game ? boxArt(props.live.game.image) ?? undefined : undefined))
</script>

<template>
  <article class="live vods-panel">
    <div class="thumb">
      <UiLink :href="site.twitchUrl" external class="thumb-link" :aria-label="`${title} (live on Twitch)`" tabindex="-1">
        <div class="vods-ring img"><img :src="thumb" alt="" decoding="async" /></div>
        <span class="tag">● LIVE</span>
        <span v-if="since" class="dur vods-mono">{{ since }}</span>
      </UiLink>
      <ManageVodButton v-if="live.vod" :id="live.vod.id" class="manage" />
    </div>

    <div class="side">
      <div class="vods-eyebrow">Live now on Twitch</div>
      <h2 class="title"><UiLink :href="site.twitchUrl" external>{{ title }}</UiLink></h2>
      <div v-if="live.game" class="game">
        <UiPosters :games="[{ name: live.game.name, image: art }]" mode="row" :size="28" />
        <span>{{ live.game.name }}</span>
      </div>
      <div class="actions">
        <UiButton :href="site.twitchUrl" external variant="primary">▶ Watch on Twitch</UiButton>
        <UiButton v-if="live.vod" :to="watchPath(live.vod)">VOD page</UiButton>
        <SeeAllButton to="/vods" class="all">See all VODs</SeeAllButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.live { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 18px; padding: 14px; }
@container vods (max-width: 760px) {
  .live { grid-template-columns: minmax(0, 1fr); }
}
.thumb { position: relative; }
.thumb-link { display: block; position: relative; color: inherit; }
.img { border-radius: var(--vods-radius); overflow: hidden; aspect-ratio: 16 / 9; background: var(--vods-surface); }
.img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tag {
  position: absolute; top: 8px; left: 8px; padding: 1px 8px; border-radius: var(--vods-radius-sm);
  background: var(--vods-bad); color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
}
.dur {
  position: absolute; top: 8px; right: 8px; font-size: 12px; padding: 0 6px; border-radius: var(--vods-radius-sm);
  background: rgb(0 0 0 / 0.75); color: #fff;
}
.manage { top: -9px; right: -9px; }
.side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.title { margin: 0; font-size: 19px; line-height: 1.3; overflow-wrap: anywhere; }
.title a { color: var(--vods-ink); text-decoration: none; }
.title a:hover { color: var(--vods-accent); }
.game { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--vods-line); }
.all { margin-left: auto; }
</style>
