<script setup lang="ts">
// The watch page body, shared by /vods/:id (and /live, /youtube): YouTube player, the timeline across
// all parts, a controls row (chapters, part picker, copy link, download, theater, shortcuts) and the chat replay.
// On phones the same controls reflow under the video and chat goes below; nothing is dropped.
// A synthetic VOD (a merge, split or playthrough) plays windows of other VODs: its timeline is a SegmentTimeline, chat
// follows whichever source VOD is playing, and a "related" menu links a playthrough's streams and the playthroughs a VOD
// is part of. When a playthrough plays on into its next stream, a card over the video says so and counts down to go on;
// when any VOD plays to its end, a card like it suggests another one to watch.
import { gamePalette, learnGameColors, useToast } from '@vex/ui/utils'
import { boxArt, toClock, watchPath, type DriveFile, type PlayableTimeline, type Position, type SegmentTimeline, type Span, type Vod } from '../../index'
import { computed, watchEffect } from 'vue'
import ChatPanel from './ChatPanel.vue'
import CountdownRing from './CountdownRing.vue'
import NextVodPreview from './NextVodPreview.vue'
import TickText from './TickText.vue'
import WatchTimeline from './WatchTimeline.vue'
import { useWatchView } from '../composables/useWatchView'
import { gamesWithArt } from '../lib/art'
import { kindLabel } from '../lib/listQuery'
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
  }>(),
  { download: null, track: true, segments: null, sources: () => [], switchTo: null },
)

const toast = useToast()
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
  theater,
  controlsOpen,
  showControls,
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
  ending,
  rolling,
  another,
  replay,
  chatError,
  shortcuts,
} = useWatchView(props, { notify: (message, options) => toast.show(message, options) })

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const rateOpts = RATES.map((r) => ({ value: String(r), label: `${r}×` }))

// Game colours are the Deep Field palette's, so they stay with the look.
const palette = computed(() => gamePalette(props.timeline.chapters.map((c) => c.name)))
const posterGames = computed(() => gamesWithArt(chapters.value).map((g) => ({ ...g, color: palette.value.get(g.name) })))
watchEffect(() => learnGameColors(posterGames.value))
</script>

<template>
  <VodsShell fill :header="!theater" sky="dim">

    <div class="watch" :class="{ nochat: !chat.open }" :style="{ '--chat-w': `${chat.width}px` }">
      <section class="stage">
        <div class="video">
          <div class="video-box">
            <div class="yt"><div ref="ytEl"></div></div>
            <div v-if="buffering && !playerError" class="buffering"><UiSpinner :size="40" label="Loading video" /></div>
            <div v-if="playerError" class="unavail">
              <div class="vods-panel vx-glass-rim un-card">
                <b>The video player didn't load</b>
                <p class="vods-muted">{{ playerError }} An ad or content blocker may be blocking youtube.com: allow it for this site, then reload the page.</p>
              </div>
            </div>
            <div v-else-if="handoffCard" class="unavail bare" role="dialog" aria-label="Next stream">
              <div class="un-card handoff">
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
            <div v-else-if="ending" class="unavail bare" role="dialog" :aria-label="ending.t != null ? 'Pick up where you left off' : 'Something else to watch?'">
              <div class="un-card handoff">
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
            <div v-else-if="curBad" class="unavail corner">
              <div class="vods-panel vx-glass-rim un-card" role="status">
                <b>This part can't play here <span class="vods-muted">({{ statusText[status[partIndex]!] }})</span></b>
                <span class="un-sub vods-muted">
                  {{ label(partIndex) }} of {{ spans.length }} · {{ toClock(spans[partIndex]!.start) }} – {{ toClock(spans[partIndex]!.end) }} of the VOD
                </span>
                <div class="un-actions">
                  <UiButton v-if="prevOk >= 0" @click="seek(spans[prevOk]!.end - 30)">← {{ label(prevOk) }}</UiButton>
                  <UiButton v-if="nextOk >= 0" variant="primary" @click="playPart(nextOk)">Skip to {{ label(nextOk) }} →</UiButton>
                </div>
              </div>
            </div>
          </div>
          <UiButton v-if="!chat.open" class="chat-reopen" icon label="Show chat" @click="chat.open = true"><UiIcon name="chat" /></UiButton>
          <ManageVodButton :id="vod.id" class="manage" :class="{ 'by-reopen': !chat.open }" />
          <button
            v-if="theater"
            type="button"
            class="peek"
            :class="{ open: controlsOpen }"
            :aria-label="controlsOpen ? 'Hide controls' : 'Show controls'"
            :title="controlsOpen ? 'Hide controls (h)' : 'Show controls (h)'"
            :aria-expanded="controlsOpen"
            @click="controlsOpen = !controlsOpen"
          >
            <UiIcon :name="controlsOpen ? 'down' : 'up'" />
          </button>
        </div>

        <div v-show="showControls" class="controls">
          <WatchTimeline
            :timeline="timeline"
            :range="range"
            :time="now"
            :status="status"
            :part-index="partIndex"
            :part-label="partLabel"
            :breaks="streamBreaks"
            :jumps="streamJumps"
            :palette="palette"
            :playing="playing"
            :rate="rate"
            @seek="seek"
          />
          <div class="row">
            <UiButton icon :label="playing ? 'Pause (k)' : 'Play (k)'" @click="togglePlay"><UiIcon :name="playing ? 'pause' : 'play'" /></UiButton>
            <!-- Volume: a vertical slider above the button, with the percentage and mute. -->
            <UiPopover prefer="up" width="64px" role="dialog">
              <template #trigger="{ toggle, open }">
                <UiButton icon :label="muted ? 'Volume: muted' : `Volume: ${volume}%`" :pressed="open" @click="toggle"><UiIcon :name="muted ? 'mute' : 'volume'" /></UiButton>
              </template>
              <div class="vol">
                <span class="vods-mono small">{{ muted ? 'muted' : `${volume}%` }}</span>
                <div class="vol-track">
                  <UiSlider :model-value="muted ? 0 : volume" :min="0" :max="100" :step="5" label="Volume" class="vol-slider" @update:model-value="setVolume" />
                </div>
                <UiButton icon size="sm" variant="ghost" :label="muted ? 'Unmute (m)' : 'Mute (m)'" :pressed="muted" @click="toggleMute">
                  <UiIcon :name="muted ? 'mute' : 'volume'" />
                </UiButton>
              </div>
            </UiPopover>
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
                <div class="title" :title="vod.title">{{ vod.title }}</div>
                <div class="sub vods-mono vods-muted">
                  <template v-if="chapter">ch {{ chapterIdx + 1 }}/{{ chapters.length }} · {{ chapter.name }} · </template><TickText :text="offsetText" /> into {{ partLabel ? label(partIndex) : label(partIndex).toLowerCase() }}
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
                    <span class="vods-mono">{{ label(i) }}</span>
                    <template #trail>
                      <UiChip v-if="unplayable(status[i])" tone="bad">{{ statusText[status[i]!] }}</UiChip>
                      <UiChip v-else-if="status[i] === 'processing'" tone="warn">processing</UiChip>
                    </template>
                  </UiMenuItem>
                </template>
              </UiPopover>
            </slot>

            <UiButton icon label="Copy link at this time" @click="copyLink"><UiIcon name="copy" /></UiButton>
            <UiPopover v-if="relatedCount" prefer="up" align="right" width="min(320px, calc(100vw - 24px))" :cap="380">
              <template #trigger="{ toggle, open }">
                <UiButton icon :label="madeOf.length ? 'Streams in this playthrough' : 'Playthroughs with this VOD'" :pressed="open" @click="toggle"><UiIcon name="list" /></UiButton>
              </template>
              <template #default="{ close }">
                <template v-if="madeOf.length">
                  <div class="vods-eyebrow menu-head">Streams · {{ madeOf.length }}</div>
                  <div v-for="(m, i) in madeOf" :key="m.key" class="stream-row">
                    <UiMenuItem :current="i === currentStream" :sub="m.sub" :title="`${m.title} · ${m.range}`" @click="seek(m.at); close()">
                      <template #lead><span class="smark vods-mono" :class="{ 'is-current': i === currentStream }">{{ m.mark }}</span></template>
                      {{ m.title }}
                    </UiMenuItem>
                    <UiButton icon size="sm" variant="ghost" :to="m.original" label="Open the original VOD" @click="close()"><UiIcon name="external" /></UiButton>
                  </div>
                </template>
                <template v-if="appearsIn.length">
                  <div class="vods-eyebrow menu-head">Also in</div>
                  <UiMenuItem
                    v-for="a in appearsIn"
                    :key="a.id"
                    :to="watchPath({ id: a.id, uploads: [] })"
                    :sub="kindLabel(a.tags)"
                    @click="close()"
                  >
                    {{ a.title || a.id }}
                  </UiMenuItem>
                </template>
              </template>
            </UiPopover>
            <UiButton v-if="downloadUrl" icon label="Download VOD" :href="downloadUrl" external><UiIcon name="download" /></UiButton>
            <UiButton icon :label="theater ? 'Leave theater mode' : 'Theater mode'" :pressed="theater" @click="theater = !theater">
              <UiIcon :name="theater ? 'theater-off' : 'theater'" />
            </UiButton>
            <UiButton
              icon
              :label="fullscreenLabel"
              :pressed="fullscreen.active.value"
              :disabled="!fullscreen.supported"
              @click="toggleFullscreen"
            >
              <UiIcon name="fullscreen" />
            </UiButton>
            <UiPopover prefer="up" align="right" width="min(300px, calc(100vw - 24px))" role="dialog">
              <template #trigger="{ toggle, open }">
                <UiButton icon label="Player settings" :pressed="open" @click="toggle"><UiIcon name="settings" /></UiButton>
              </template>
              <div class="settings">
                <div class="vods-eyebrow">Player settings</div>
                <div class="set col">
                  <span>Volume</span>
                  <span class="set-row">
                    <UiButton icon size="sm" variant="ghost" :label="muted ? 'Unmute' : 'Mute'" :pressed="muted" @click="toggleMute">
                      <UiIcon :name="muted ? 'mute' : 'volume'" />
                    </UiButton>
                    <UiSlider :model-value="muted ? 0 : volume" :min="0" :max="100" :step="5" label="Volume" class="grow" @update:model-value="setVolume" />
                    <span class="vods-mono small pct">{{ muted ? 'muted' : `${volume}%` }}</span>
                  </span>
                </div>
                <div class="set col">
                  <span>Speed</span>
                  <UiSegmented :model-value="String(rate)" :options="rateOpts" label="Playback speed" @update:model-value="(v) => v && setRate(Number(v))" />
                </div>
                <div class="set">
                  <label for="watch-yt-controls">YouTube controls <span class="vods-muted small">YouTube's own bar over the video</span></label>
                  <UiSwitch id="watch-yt-controls" v-model="settings.youtubeControls" />
                </div>
              </div>
            </UiPopover>
            <!-- Keyboard shortcuts mean nothing on a touch screen. -->
            <span class="shortcuts">
              <UiPopover prefer="up" align="right" width="min(260px, calc(100vw - 24px))" role="dialog">
                <template #trigger="{ toggle, open }">
                  <UiButton icon label="Keyboard shortcuts" :pressed="open" @click="toggle"><UiIcon name="keyboard" /></UiButton>
                </template>
                <div class="vods-eyebrow menu-head">Shortcuts</div>
                <div v-for="s in shortcuts" :key="s.label" class="kv">
                  <UiKbd>{{ s.display }}</UiKbd><span class="vods-muted">{{ s.label }}</span>
                </div>
              </UiPopover>
            </span>
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
/* Over the black above the player's own top-right icons; beside "show chat" when that's there. */
.manage { right: 8px; top: 8px; opacity: 0.7; }
.manage:hover, .manage:focus-visible { opacity: 1; }
.manage.by-reopen { right: 48px; }

.unavail { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; background: rgb(0 0 0 / 0.75); }
/* The player's own cards (next stream, end of the VOD) sit straight on the black where the video was, no panel. */
.unavail.bare { background: #000; }
/* A part YouTube won't play: a small box in the corner. The embed stays visible and clickable under it (YouTube's
   own error or "sign in to confirm you're not a bot" button lives in the iframe), so only the box takes clicks. */
.unavail.corner { inset: auto 0 8px; display: flex; justify-content: center; padding: 0 8px; background: none; pointer-events: none; }
.unavail.corner .un-card {
  pointer-events: auto; max-width: 100%; padding: 6px 8px 6px 10px; font-size: 12px; line-height: 1.3;
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 10px; row-gap: 0;
}
.unavail.corner .un-sub { grid-column: 1; font-size: 11px; }
.unavail.corner .un-actions { grid-column: 2; grid-row: 1 / span 2; margin-top: 0; gap: 6px; }
.smark-next { color: var(--vods-accent); margin-right: 4px; }
.handoff-actions { align-items: center; justify-content: center; gap: 16px; flex-wrap: nowrap; }
.handoff-btns { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.go { min-width: 12ch; justify-content: center; }
.go.stop { background: var(--vods-warn); border-color: var(--vods-warn); color: var(--vods-bg); font-weight: 600; box-shadow: none; backdrop-filter: none; }
.go.stop:hover { filter: brightness(1.08); color: var(--vods-bg); }

.controls { border-top: 1px solid var(--vods-line); background: rgb(0 0 0 / 0.7); }
/* Over the video's bottom edge, out of the layout, so the video keeps the whole height. */
.peek {
  position: absolute; left: 50%; bottom: 0; z-index: 1; transform: translateX(-50%);
  display: grid; place-items: center; width: 48px; height: 20px; padding: 0; border: none; border-radius: 6px 6px 0 0;
  background: rgb(0 0 0 / 0.75); color: var(--vods-ink); font-size: 10px; line-height: 1; cursor: pointer; opacity: 0.8;
  transition: opacity 0.15s, color 0.15s;
}
.peek .watch-icon { width: 14px; height: 14px; }
.peek:hover, .peek:focus-visible { opacity: 1; color: var(--vods-ink); }
.peek:focus-visible { outline: 2px solid var(--vods-accent); outline-offset: -2px; }
.row { display: flex; align-items: center; gap: 8px; padding: 6px 12px 8px; min-width: 0; }
.time { font-size: 12px; white-space: nowrap; }
.now { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; margin-left: 4px; }
.poster-btn { background: none; border: none; padding: 0 4px; cursor: pointer; display: flex; height: 32px; align-items: center; color: inherit; border-radius: var(--vods-radius-sm); }
.poster-btn:focus-visible { outline: 2px solid var(--vods-accent); }
.now-text { min-width: 0; line-height: 1.3; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.partbtn { min-width: 92px; }
.menu-head { padding: 6px 8px; }
.stream-row { display: flex; align-items: center; gap: 2px; }
.stream-row > :first-child { flex: 1; min-width: 0; }
.smark { font-size: 11px; color: var(--vods-muted); min-width: 2.5ch; }
.smark.is-current { color: var(--vods-accent); }
.settings { display: flex; flex-direction: column; padding: 8px; gap: 2px; }
.set { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
.set.col { flex-direction: column; align-items: stretch; gap: 6px; }
.set-row { display: flex; align-items: center; gap: 6px; }
.set label { display: flex; flex-direction: column; gap: 2px; }
.grow { flex: 1; min-width: 0; }
.small { font-size: 11px; }
.pct { width: 6ch; text-align: right; }
.vol { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0 4px; }
/* UiSlider has no vertical form: a horizontal one turned a quarter, in a box its turned size. */
.vol-track { position: relative; width: 28px; height: 120px; }
.vol-slider { position: absolute; left: 50%; top: 50%; width: 120px; transform: translate(-50%, -50%) rotate(-90deg); }
.shortcuts { display: contents; }
@media (pointer: coarse) {
  .shortcuts { display: none; }
}
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 4px 8px; font-size: 12px; }

.watch > :deep(.chat) { border-left: 1px solid var(--vods-line); }

@container vods (max-width: 700px) {
  .watch, .watch.nochat { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(320px, 1fr); overflow-y: auto; overflow-x: hidden; }
  .stage { display: contents; }
  .video { flex: none; container-type: inline-size; }
  .video-box { width: 100%; }
  .video:has(.unavail:not(.corner)) .video-box { aspect-ratio: auto; min-height: 56.25cqw; display: grid; }
  .unavail:not(.corner) { position: relative; }
  .unavail.corner .un-sub { display: none; }
  .video:has(.unavail:not(.corner)) .yt { visibility: hidden; }
  /* Same controls as desktop, reflowed: title on its own line, everything else wraps below it */
  .row { flex-wrap: wrap; gap: 6px; }
  .time { margin-right: auto; }
  .now { order: -1; flex-basis: 100%; margin-left: 0; }
  .partbtn { min-width: 0; }
  .hide-sm { display: none; }
  .watch > :deep(.chat) { border-left: none; border-top: 1px solid var(--vods-line); }
}
</style>
