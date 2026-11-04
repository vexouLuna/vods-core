<script setup lang="ts">
// The watch page body, shared by /vods/:id (and /live, /youtube): no site header (a back button over the player
// instead), the YouTube player, the timeline across all parts, a controls row (play, volume, time, chapters with the
// title and day, part picker (on phones with the related VODs in it), fullscreen, and a settings menu that also holds
// copy link, download and the shortcuts) and the chat replay. An arrow on the controls' top edge collapses them; the same arrow over the video brings them back.
// On phones the same controls reflow under the video and chat goes below; nothing is dropped.
// A synthetic VOD (a merge, split or playthrough) plays windows of other VODs: its timeline is a SegmentTimeline, chat
// follows whichever source VOD is playing, and a "related" menu links a playthrough's streams and the playthroughs a VOD
// is part of. When a playthrough plays on into its next stream, a card over the video says so and counts down to go on;
// when any VOD plays to its end, a card like it suggests another one to watch.
import { gamePalette, learnGameColors, useToast } from '@vex/ui/utils'
import { boxArt, gamesOf, toClock, watchPath, type DriveFile, type PlayableTimeline, type Position, type SegmentTimeline, type Span, type Vod } from '../../index'
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import VolumeControl from './VolumeControl.vue'
import WatchIcon from './WatchIcon.vue'
import RelatedMenu from './RelatedMenu.vue'
import ChatPanel from './ChatPanel.vue'
import CountdownRing from './CountdownRing.vue'
import NextVodPreview from './NextVodPreview.vue'
import TickText from './TickText.vue'
import WatchTimeline from './WatchTimeline.vue'
import { useWatchView } from '../composables/useWatchView'
import { WIDTH_DEFAULT, WIDTH_MIN } from '../composables/useChatSettings'
import type { TimelineMark } from '../composables/useTimeline'
import { setPreferredTrack, type Track } from '../lib/tracks'
import { gamesWithArt } from '../lib/art'
import VodsShell from './VodsShell.vue'
import ManageVodButton from './ManageVodButton.vue'

const props = withDefaults(
  defineProps<{
    vod: Vod
    timeline: PlayableTimeline
    /** A synthetic VOD's timeline again, for chat and the related menu (null for a plain VOD). */
    segments?: SegmentTimeline | null
    /** A synthetic VOD's source VODs that loaded. */
    sources?: readonly Vod[]
    start: Position
    /** VOD time the timeline bar covers; defaults to the whole VOD. */
    range?: Span
    /** Label for part i in the picker and on the bar. */
    partLabel?: (i: number) => string
    /** Link to this page at VOD time t (for "copy link"). */
    shareUrl: (t: number) => string
    download?: DriveFile | null
    /** Save the watch position in this browser. */
    track?: boolean
    /** The other version of a synthetic VOD with a compiled upload (its segments, or that one file). */
    switchTo?: { label: string; to: string } | null
    /** Its tracks (live recording, Twitch's VOD) when it has more than one: a switch in the settings menu. */
    tracks?: readonly Track[]
  }>(),
  { download: null, track: true, segments: null, sources: () => [], switchTo: null, tracks: () => [] },
)

const toast = useToast()
const router = useRouter()
/** The page has no site header, so a back button over the player: to the page before, or home when there's none. */
function goBack() {
  if (window.history.state?.back) router.back()
  else void router.push('/')
}
// The page's logic is useWatchView's. Its `time` changes on every tick and is never read here: the clock, the
// time into the part and the timeline bar read it through getters, so this template doesn't re-render each tick.
const {
  chat,
  range,
  spans,
  label,
  cutNote,
  unplayable,
  ytEl,
  now,
  clockText,
  offsetText,
  playing,
  buffering,
  rate,
  volume,
  muted,
  settings,
  partIndex,
  status,
  playerError,
  seek,
  playPart,
  togglePlay,
  setVolume,
  toggleMute,
  setRate,
  statusText,
  curBad,
  prevOk,
  nextOk,
  chapters,
  chapter,
  chapterIdx,
  streamBreaks,
  streamJumps,
  chapterStream,
  controlsOpen,
  fullscreen,
  toggleFullscreen,
  fullscreenLabel,
  copyLink,
  downloadUrl,
  madeOf,
  currentStream,
  appearsIn,
  relatedCount,
  AUTO_CONTINUE,
  handoffCard,
  countdown,
  grace,
  stopCountdown,
  closeHandoff,
  badStep,
  badLeft,
  stopBad,
  runBad,
  time,
  ending,
  rolling,
  another,
  replay,
  chatError,
  shortcuts,
} = useWatchView(props, { notify: (message, options) => toast.show(message, options) })

// A phone's row has no room for the related VODs' button: there they're in the part picker's menu (the same 700px as
// the layout's container query below).
const narrow = ref(false)
let phone: MediaQueryList | undefined
const measure = () => (narrow.value = !!phone?.matches)
onMounted(() => {
  phone = matchMedia('(max-width: 700px)')
  measure()
  phone.addEventListener('change', measure)
})
onBeforeUnmount(() => phone?.removeEventListener('change', measure))
// Chat's "largest video" width: what's left beside a 16:9 video as tall as its box, never under WIDTH_MIN.
const watchEl = ref<HTMLElement>()
const videoEl = ref<HTMLElement>()
const fitWidth = ref(WIDTH_DEFAULT)
let sizes: ResizeObserver | undefined
onMounted(() => {
  sizes = new ResizeObserver(() => {
    if (watchEl.value && videoEl.value) fitWidth.value = Math.max(WIDTH_MIN, Math.floor(watchEl.value.clientWidth - (videoEl.value.clientHeight * 16) / 9))
  })
  sizes.observe(watchEl.value!)
  sizes.observe(videoEl.value!)
})
onBeforeUnmount(() => sizes?.disconnect())
const chatWidth = computed(() => (chat.autoWidth ? fitWidth.value : chat.width))
// The buttons over the video (back, show chat, manage, the controls' arrow) fade after 2s without the pointer moving
// over the player; moving, a touch, hover or focus brings them back. Over YouTube's iframe the page sees no
// movement, so there they fade even while the pointer moves, until it reaches a button.
const idle = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake() {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => (idle.value = true), 2000)
}
onMounted(wake)
onBeforeUnmount(() => clearTimeout(idleTimer))
/** The shortcut list, folded away in the settings menu. */
const showKeys = ref(false)

/** The centred cards (next stream, end of the VOD, a part that can't play) folded small at the bottom, off the player. */
const mini = ref(false)
// Each new card opens big.
watch(
  () => (handoffCard.value ? `h:${handoffCard.value.to.mark}` : ending.value ? `e:${ending.value.vod.id}` : curBad.value ? `b:${partIndex.value}` : ''),
  () => (mini.value = false),
)

// Switching tracks opens this page on the other one at the same moment, and is the track from then on.
const trackOpts = computed(() => props.tracks.map((k) => ({ value: k.type, label: k.label })))
function pickTrack(type: string | null | undefined) {
  const k = props.tracks.find((x) => x.type === type)
  if (!k) return
  setPreferredTrack(k.type)
  if (k.type !== props.timeline.type) void router.push(k.to(time.value))
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const rateOpts = RATES.map((r) => ({ value: String(r), label: `${r}×` }))

// Game colours are the Deep Field palette's, so they stay with the look.
const palette = computed(() => gamePalette(props.timeline.chapters.map((c) => c.name)))
const posterGames = computed(() => gamesWithArt(chapters.value).map((g) => ({ ...g, color: palette.value.get(g.name) })))
watchEffect(() => learnGameColors(posterGames.value))

// The heading: "Sat, Feb 21, 2026 · 6:56:40 · Just Chatting, MOONROT, +4"; a playthrough gives its streams' days.
const day = (d: Date, year = true) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: year ? 'numeric' : undefined })
const when = computed(() => {
  if (madeOf.value.length < 2) return day(props.vod.createdAt)
  const days = props.sources.map((s) => s.createdAt).sort((a, b) => a.getTime() - b.getTime())
  const n = `${madeOf.value.length} streams`
  if (!days.length) return n
  const sameYear = days[0]!.getFullYear() === days.at(-1)!.getFullYear()
  return `${n} · ${day(days[0]!, !sameYear)} – ${day(days.at(-1)!)}`
})
const games = computed(() => {
  const all = gamesOf(props.vod)
  return all.length > 3 ? `${all.slice(0, 3).join(', ')}, +${all.length - 3}` : all.join(', ')
})
/** "ch 2/3" says something only when the chapters aren't simply one per stream (or one in all). */
const chapterCount = computed(() => chapters.value.length > 1 && chapters.value.length !== madeOf.value.length)

// Above the bar: a playthrough's streams by their day. A plain VOD's games are only on the bar (and the chapters menu).
const marks = computed<TimelineMark[]>(() =>
  madeOf.value.length > 1 ? madeOf.value.map((m) => ({ t: m.at, label: m.sub || m.mark, title: `${m.mark} · ${m.title}` })) : [],
)
</script>

<template>
  <VodsShell fill :header="false" sky="dim">
    <div ref="watchEl" class="watch" :class="{ nochat: !chat.open }" :style="{ '--chat-w': `${chatWidth}px` }">
      <section class="stage">
        <div ref="videoEl" class="video" :class="{ idle }" @pointermove="wake" @pointerdown="wake">
          <div class="video-box">
            <div class="yt"><div ref="ytEl"></div></div>
            <div v-if="buffering && !playerError" class="buffering"><UiSpinner :size="40" label="Loading video" /></div>
            <div v-if="playerError" class="unavail">
              <div class="vods-panel vx-glass-rim un-card">
                <b>The video player didn't load</b>
                <p class="vods-muted">{{ playerError }} An ad or content blocker may be blocking youtube.com: allow it for this site, then reload the page.</p>
              </div>
            </div>
            <div v-else-if="handoffCard" class="unavail bare" :class="{ mini }" role="dialog" aria-label="Next stream">
              <div class="un-card handoff">
                <UiButton class="un-mini" variant="ghost" icon :label="mini ? 'Maximize' : 'Minimize'" :title="mini ? 'Maximize' : 'Minimize'" @click="mini = !mini">
                  <WatchIcon :name="mini ? 'up' : 'down'" />
                </UiButton>
                <div class="vods-eyebrow">End of {{ handoffCard.from.mark }} · {{ handoffCard.from.sub }}</div>
                <b><span class="vods-mono smark-next">{{ handoffCard.to.mark }}</span> {{ handoffCard.to.title }}</b>
                <p class="vods-muted">Next stream, from {{ handoffCard.to.sub }}.</p>
                <div class="un-actions handoff-actions">
                  <CountdownRing :left="countdown" :total="AUTO_CONTINUE" label="Continuing" />
                  <div class="handoff-btns">
                    <UiButton :to="handoffCard.from.finish" :title="`${handoffCard.from.title}, from where this playthrough leaves it`">
                      Finish {{ handoffCard.from.mark }} on its VOD ↗
                    </UiButton>
                    <!-- One button: stops the timer, then (after a short grace, against a double click) continues. -->
                    <UiButton v-if="countdown !== null" class="go stop" @click="stopCountdown">Stop timer</UiButton>
                    <UiButton v-else variant="primary" class="go" :disabled="grace" @click="closeHandoff(true)">Continue →</UiButton>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="ending" class="unavail bare" :class="{ mini }" role="dialog" :aria-label="ending.t != null ? 'Pick up where you left off' : 'Something else to watch?'">
              <div class="un-card handoff">
                <UiButton class="un-mini" variant="ghost" icon :label="mini ? 'Maximize' : 'Minimize'" :title="mini ? 'Maximize' : 'Minimize'" @click="mini = !mini">
                  <WatchIcon :name="mini ? 'up' : 'down'" />
                </UiButton>
                <div class="vods-eyebrow">End of the VOD</div>
                <b>{{ ending.t != null ? 'Pick up where you left off' : 'Something else to watch?' }}</b>
                <NextVodPreview :vod="ending.vod" :t="ending.t" />
                <div class="un-actions handoff-actions">
                  <!-- Stopped from the start, for now. -->
                  <CountdownRing :left="null" :total="AUTO_CONTINUE" label="Continuing" />
                  <div class="handoff-btns">
                    <UiButton :disabled="rolling" title="Suggest a different VOD" @click="another">Another suggestion</UiButton>
                    <UiButton variant="primary" class="go" :to="watchPath(ending.vod, ending.t ?? undefined)">Watch →</UiButton>
                  </div>
                </div>
              </div>
            </div>
            <!-- Like the handoff card, but over the embed (dimmed, still clickable round the card: YouTube's own error or
                 "sign in to confirm you're not a bot" button lives in the iframe). -->
            <div v-else-if="curBad" class="unavail bad" :class="{ mini }" role="status">
              <div class="un-card handoff">
                <UiButton class="un-mini" variant="ghost" icon :label="mini ? 'Maximize' : 'Minimize'" :title="mini ? 'Maximize' : 'Minimize'" @click="mini = !mini">
                  <WatchIcon :name="mini ? 'up' : 'down'" />
                </UiButton>
                <div class="vods-eyebrow">
                  {{ partLabel ? label(partIndex) : `${label(partIndex)} of ${spans.length}` }} · {{ toClock(spans[partIndex]!.start) }} – {{ toClock(spans[partIndex]!.end) }}
                </div>
                <b>This part can't play here <span class="vods-muted">({{ statusText[status[partIndex]!] }})</span></b>
                <p v-if="badStep?.kind === 'switch'" class="vods-muted">The {{ badStep.track.label }} track has it: same moment, this part only.</p>
                <p v-else-if="badStep" class="vods-muted">No track has it. Next: {{ label(badStep.part) }}.</p>
                <div class="un-actions handoff-actions">
                  <CountdownRing v-if="badStep" :left="badLeft" :total="badStep.seconds" :label="badStep.kind === 'switch' ? 'Switching' : 'Skipping'" />
                  <div class="handoff-btns">
                    <UiButton v-if="prevOk >= 0" @click="seek(spans[prevOk]!.end - 30)">← {{ label(prevOk) }}</UiButton>
                    <UiButton v-if="badStep && badLeft !== null" class="go stop" @click="stopBad">Stop timer</UiButton>
                    <UiButton v-else-if="badStep?.kind === 'switch'" variant="primary" class="go" @click="runBad">{{ badStep.track.label }} track →</UiButton>
                    <UiButton v-else-if="nextOk >= 0" variant="primary" class="go" @click="playPart(nextOk)">Skip to {{ label(nextOk) }} →</UiButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- shortcut: drawn here until vex-ui's icon set has "back"; then <UiIcon name="back" />. -->
          <UiButton class="back over" variant="ghost" icon label="Back" @click="goBack"><WatchIcon name="back" /></UiButton>
          <UiButton v-if="!chat.open" class="chat-reopen over" variant="ghost" icon label="Show chat" @click="chat.open = true"><UiIcon name="chat" /></UiButton>
          <ManageVodButton :id="vod.id" class="manage over" :class="{ 'by-reopen': !chat.open }" />
          <button
            type="button"
            class="peek over"
            :class="{ open: controlsOpen }"
            :aria-label="controlsOpen ? 'Hide controls' : 'Show controls'"
            :title="controlsOpen ? 'Hide controls (h)' : 'Show controls (h)'"
            :aria-expanded="controlsOpen"
            @click="controlsOpen = !controlsOpen"
          >
            <UiIcon :name="controlsOpen ? 'down' : 'up'" />
          </button>
        </div>

        <div v-show="controlsOpen" class="controls vods-player-controls">
          <WatchTimeline
            :timeline="timeline"
            :range="range"
            :time="now"
            :status="status"
            :marks="marks"
            :breaks="streamBreaks"
            :jumps="streamJumps"
            :palette="palette"
            :playing="playing"
            :rate="rate"
            @seek="seek"
          />
          <div class="row">
            <UiButton icon :label="playing ? 'Pause (k)' : 'Play (k)'" @click="togglePlay"><UiIcon :name="playing ? 'pause' : 'play'" /></UiButton>
            <VolumeControl :volume="volume" :muted="muted" @volume="setVolume" @mute="toggleMute" />
            <span class="time vods-mono"><TickText :text="clockText" /> <span class="vods-muted">/ {{ toClock(range.end) }}</span></span>

            <div class="now">
              <UiPopover prefer="up" width="min(340px, calc(100vw - 24px))" :cap="380">
                <template #trigger="{ toggle, open }">
                  <button type="button" class="poster-btn" :class="{ open }" title="Chapters" aria-label="Chapters" @click="toggle">
                    <UiPosters :games="posterGames" :size="26" />
                  </button>
                </template>
                <template #default="{ close }">
                  <div class="vods-eyebrow menu-head">Chapters · {{ chapters.length }}</div>
                  <UiMenuItem
                    v-for="(c, i) in chapters"
                    :key="i"
                    :current="i === chapterIdx"
                    :disabled="c.restricted"
                    :sub="chapterStream(c) ? `${chapterStream(c)} · ${toClock(c.start)}` : toClock(c.start)"
                    @click="seek(Math.max(c.start, range.start)); close()"
                  >
                    <template #lead>
                      <UiPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="24" />
                    </template>
                    {{ c.name }}
                    <template v-if="cutNote(c)" #trail><UiChip :title="cutNote(c)!.title">{{ cutNote(c)!.label }}</UiChip></template>
                  </UiMenuItem>
                </template>
              </UiPopover>
              <div class="now-text">
                <h1 class="title" :title="vod.title">{{ vod.title || 'Untitled stream' }}</h1>
                <div class="sub vods-mono vods-muted">
                  <span :title="games ? gamesOf(vod).join(', ') : undefined">{{ when }}</span> ·
                  <template v-if="chapter"><template v-if="chapterCount">ch {{ chapterIdx + 1 }}/{{ chapters.length }} · </template>{{ chapter.name }} · </template>
                  <template v-if="partLabel">{{ label(partIndex) }} · <TickText :text="offsetText" /></template>
                  <template v-else><TickText :text="offsetText" /> into {{ label(partIndex).toLowerCase() }}</template>
                </div>
              </div>
            </div>

            <UiButton v-if="switchTo" size="sm" variant="ghost" :to="switchTo.to">{{ switchTo.label }}</UiButton>
            <slot name="parts" :part-index="partIndex">
              <UiPopover prefer="up" align="right" width="min(320px, calc(100vw - 24px))" :cap="360">
                <template #trigger="{ toggle, open }">
                  <UiButton class="vods-mono partbtn" :pressed="open" label="YouTube part" @click="toggle">
                    <span class="hide-sm">Part&nbsp;</span>{{ partIndex + 1 }}<span class="vods-muted">/{{ spans.length }}</span> ▾
                  </UiButton>
                </template>
                <template #default="{ close }">
                  <div class="vods-eyebrow menu-head">YouTube parts · {{ spans.length }}</div>
                  <UiMenuItem
                    v-for="(s, i) in spans"
                    :key="i"
                    :current="i === partIndex"
                    :sub="`${toClock(s.start)}–${toClock(s.end)}`"
                    @click="playPart(i); close()"
                  >
                    <span :class="{ 'vods-mono': !partLabel }">{{ label(i) }}</span>
                    <template #trail>
                      <UiChip v-if="unplayable(status[i])" tone="bad">{{ statusText[status[i]!] }}</UiChip>
                      <UiChip v-else-if="status[i] === 'processing'" tone="warn">processing</UiChip>
                    </template>
                  </UiMenuItem>
                  <RelatedMenu v-if="narrow && relatedCount" :made-of="madeOf" :current-stream="currentStream" :appears-in="appearsIn" @seek="seek" @close="close" />
                </template>
              </UiPopover>
            </slot>

            <UiPopover v-if="relatedCount && !narrow" prefer="up" align="right" width="min(320px, calc(100vw - 24px))" :cap="380">
              <template #trigger="{ toggle, open }">
                <UiButton icon :label="madeOf.length ? 'Streams in this playthrough' : 'Playthroughs with this VOD'" :pressed="open" @click="toggle"><UiIcon name="list" /></UiButton>
              </template>
              <template #default="{ close }">
                <RelatedMenu :made-of="madeOf" :current-stream="currentStream" :appears-in="appearsIn" @seek="seek" @close="close" />
              </template>
            </UiPopover>
            <UiButton
              icon
              :label="fullscreenLabel"
              :pressed="fullscreen.active.value"
              :disabled="!fullscreen.supported"
              @click="toggleFullscreen"
            >
              <UiIcon name="fullscreen" />
            </UiButton>
            <!-- Wide enough for the six speeds in one row with any site's controls. -->
            <UiPopover prefer="up" align="right" width="min(380px, calc(100vw - 24px))" role="dialog">
              <template #trigger="{ toggle, open }">
                <UiButton icon label="Player settings" :pressed="open" @click="toggle"><UiIcon name="settings" /></UiButton>
              </template>
              <template #default="{ close }">
              <div class="settings">
                <div class="vods-eyebrow">Player settings</div>
                <div class="set col">
                  <span>Speed</span>
                  <UiSegmented class="speeds" :model-value="String(rate)" :options="rateOpts" label="Playback speed" @update:model-value="(v) => v && setRate(Number(v))" />
                </div>
                <div v-if="tracks.length > 1" class="set col">
                  <span>Track <span class="vods-muted small">the live recording, or Twitch's muted VOD</span></span>
                  <UiSegmented :model-value="timeline.type" :options="trackOpts" label="Track" @update:model-value="(v) => { pickTrack(v); close() }" />
                </div>
                <div class="set">
                  <label for="watch-captions">Captions <span class="vods-muted small">YouTube's, when the video has them</span></label>
                  <UiSwitch id="watch-captions" v-model="settings.captions" />
                </div>
                <div class="set">
                  <label for="watch-yt-controls">YouTube controls <span class="vods-muted small">YouTube's own bar over the video</span></label>
                  <UiSwitch id="watch-yt-controls" v-model="settings.youtubeControls" />
                </div>
                <hr class="sep" />
                <UiMenuItem @click="copyLink(); close()"><template #lead><UiIcon name="copy" /></template>Copy link at this time</UiMenuItem>
                <UiMenuItem v-if="downloadUrl" :href="downloadUrl" external @click="close()"><template #lead><UiIcon name="download" /></template>Download VOD</UiMenuItem>
                <!-- Keyboard shortcuts mean nothing on a touch screen. -->
                <span class="shortcuts">
                  <UiMenuItem :aria-expanded="showKeys" @click="showKeys = !showKeys"><template #lead><UiIcon name="keyboard" /></template>Keyboard shortcuts</UiMenuItem>
                  <template v-if="showKeys">
                    <div v-for="s in shortcuts" :key="s.label" class="kv">
                      <UiKbd>{{ s.display }}</UiKbd><span class="vods-muted">{{ s.label }}</span>
                    </div>
                  </template>
                </span>
              </div>
              </template>
            </UiPopover>
          </div>
        </div>
      </section>

      <ChatPanel
        v-if="chat.open"
        :messages="replay.messages.value"
        :settings="chat"
        :error="chatError"
        :loading="replay.loading.value"
        :no-chat="replay.noChat.value"
        :playing="playing"
        :sources="replay.sources.value"
        :served="replay.served.value"
        @hide="chat.open = false"
      />
    </div>
  </VodsShell>
</template>

<style scoped>
/* Chat width is the viewer's, in pixels (chat settings), so a bigger screen gives the video the room; never under
   240px or so wide the video gets narrower than 320px. */
.watch { display: grid; grid-template-columns: minmax(0, 1fr) clamp(240px, var(--chat-w, 340px), max(240px, calc(100% - 320px))); flex: 1; min-height: 0; }
.watch.nochat { grid-template-columns: minmax(0, 1fr); }

.stage { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.video { position: relative; flex: 1; min-height: 0; container-type: size; display: grid; place-items: center; background: #000; }
.video-box { position: relative; width: min(100cqw, 100cqh * 16 / 9); aspect-ratio: 16 / 9; }
.yt, .yt :deep(iframe) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.buffering { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.chat-reopen { position: absolute; right: 8px; top: 8px; }
.back { position: absolute; left: 8px; top: 8px; }
/* Over the black above the player's own top-right icons; beside "show chat" when that's there. */
.manage { right: 8px; top: 8px; }
/* No background over the video, only a shadow to keep them readable on a bright frame. */
.over { transition: opacity 0.3s; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.9)); }
.video.idle .over:not(:hover, :focus-visible) { opacity: 0.3; }
.manage.by-reopen { right: 48px; }

.unavail { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; background: rgb(0 0 0 / 0.75); }
/* The player's own cards (next stream, end of the VOD) sit straight on the black where the video was, no panel. */
.unavail.bare { background: #000; }
.un-card { max-width: 400px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.un-card p { font-size: 13px; line-height: 1.5; margin: 0; }
/* The countdown beside its buttons; when the card is too narrow they wrap under it, both centred. */
.un-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
/* A part YouTube won't play: the embed stays visible (dimmed) and clickable around the card. */
.unavail.bad { pointer-events: none; }
.unavail.bad .un-card { pointer-events: auto; }
.un-card.handoff { position: relative; }
.un-mini { position: absolute; top: 4px; right: 4px; }
/* Minimized: a small box at the bottom, the player visible and clickable everywhere else. */
.unavail.mini { inset: auto 0 8px; display: flex; justify-content: center; padding: 0 8px; background: none; pointer-events: none; }
.unavail.mini .un-card {
  pointer-events: auto; max-width: 100%; padding: 6px 40px 6px 10px; font-size: 12px; line-height: 1.3;
  flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 10px;
}
.unavail.mini .un-card > p, .unavail.mini .un-card > .vods-eyebrow, .unavail.mini .un-card > .next { display: none; }
.unavail.mini .un-mini { top: 50%; transform: translateY(-50%); }
.unavail.mini .un-actions { margin-top: 0; gap: 6px; flex-wrap: nowrap; }
.unavail.mini .handoff-btns { flex-direction: row; }
.unavail.mini .un-actions :deep(.ring) { width: 34px; height: 34px; }
.unavail.mini .un-actions :deep(.ring-n) { font-size: 14px; }
.unavail.mini .go { min-width: 0; }
.smark-next { color: var(--vods-accent); margin-right: 4px; }
.handoff-actions { align-items: center; justify-content: center; gap: 16px; }
.handoff-btns { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.go { min-width: 12ch; justify-content: center; }
.go.stop { background: var(--vods-warn); border-color: var(--vods-warn); color: var(--vods-bg); font-weight: 600; box-shadow: none; backdrop-filter: none; }
.go.stop:hover { filter: brightness(1.08); color: var(--vods-bg); }

.controls { border-top: 1px solid var(--vods-line); background: rgb(0 0 0 / 0.7); }
/* On the video's bottom edge, right above the controls (or where they were), out of the layout. */
.peek {
  position: absolute; left: 50%; bottom: 0; z-index: 1; transform: translateX(-50%);
  display: grid; place-items: center; width: 48px; height: 20px; padding: 0; border: none; border-radius: 6px 6px 0 0;
  background: none; color: var(--vods-ink); font-size: 10px; line-height: 1; cursor: pointer;
}
.peek .watch-icon { width: 14px; height: 14px; }
.peek:focus-visible { outline: 2px solid var(--vods-accent); outline-offset: -2px; }
.row { display: flex; align-items: center; gap: 8px; padding: 6px 12px 8px; min-width: 0; }
.time { font-size: var(--vods-player-time); white-space: nowrap; }
.now { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; margin-left: 4px; }
.poster-btn { background: none; border: none; padding: 0 4px; cursor: pointer; display: flex; height: 32px; align-items: center; color: inherit; border-radius: var(--vods-radius-sm); }
.poster-btn:focus-visible { outline: 2px solid var(--vods-accent); }
.now-text { min-width: 0; line-height: 1.3; }
.title { margin: 0; font-size: var(--vods-player-heading); line-height: 1.3; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: var(--vods-player-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.partbtn { min-width: 92px; }
.menu-head { padding: 6px 8px; }
.settings { display: flex; flex-direction: column; padding: 8px; gap: 2px; }
.set { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
.set.col { flex-direction: column; align-items: stretch; gap: 6px; }
.speeds { align-self: flex-start; max-width: 100%; }
.set label { display: flex; flex-direction: column; gap: 2px; }
.small { font-size: 11px; }
.shortcuts { display: contents; }
@media (pointer: coarse) {
  .shortcuts { display: none; }
}
.sep { border: 0; border-top: 1px solid var(--vods-line); margin: 6px 0; width: 100%; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 4px 8px; font-size: 12px; }

.watch > :deep(.chat) { border-left: 1px solid var(--vods-line); }

@container vods (max-width: 700px) {
  .watch, .watch.nochat { grid-template-columns: minmax(0, 1fr); grid-template-rows: max-content max-content minmax(320px, 1fr); overflow-y: auto; overflow-x: hidden; }
  .stage { display: contents; }
  .video { flex: none; container-type: inline-size; }
  .video-box { width: 100%; }
  .video:has(.unavail:not(.mini)) .video-box { aspect-ratio: auto; min-height: 56.25cqw; display: grid; }
  .unavail:not(.mini) { position: relative; }
  /* Clear of the back button over the top-left corner. */
  .unavail.bare:not(.mini), .unavail.bad:not(.mini) { padding-top: 44px; }
  .video:has(.unavail:not(.mini)) .yt { visibility: hidden; }
  /* Same controls as desktop, reflowed: title on its own line, everything else wraps below it */
  .row { flex-wrap: wrap; gap: 4px; padding-inline: 8px; }
  .time { margin-right: auto; }
  .now { order: -1; flex-basis: 100%; margin-left: 0; }
  .partbtn { min-width: 0; }
  .hide-sm { display: none; }
  .watch > :deep(.chat) { grid-row: 3; border-left: none; border-top: 1px solid var(--vods-line); }
}
</style>
