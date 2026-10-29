import { onMounted, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { ChatSource, ChatSources } from '../api/types'
import type { SegmentTimeline } from '../composite'
import { mountYouTube, WatchPlayer, type PartStatus } from '../player'
import type { SaveStatus } from '../progress'
import type { PlayableTimeline, Position } from '../timeline'
import { chatSourceFor, useChat } from './useChat'
import { useProgress } from './useProgress'

export interface UseWatchPlayerOptions {
  vodId: MaybeRefOrGetter<string>
  /** VOD seconds, for saving progress. */
  duration: MaybeRefOrGetter<number>
  /** What to play (read once, when the player mounts). */
  timeline: MaybeRefOrGetter<PlayableTimeline>
  /** Where to start; `timeline.locate(t)` turns a VOD time into one. */
  start?: Position
  autoplay?: boolean
  /** YouTube's own controls over the video (default off). Changing it makes a new YouTube player at the same time. */
  controls?: MaybeRefOrGetter<boolean>
  /** A synthetic VOD's timeline, so chat follows the source VOD playing. */
  segments?: MaybeRefOrGetter<SegmentTimeline | null | undefined>
  /**
   * Chat replay, or false for none. `source` is the viewer's choice (`auto`: the archive's), used unless this VOD has
   * none of it and has the other; `offset` is the viewer's chat delay in seconds.
   */
  chat?: false | { source?: MaybeRefOrGetter<ChatSource | 'auto'>; offset?: Ref<number> }
  /** Save the watch position (the context's progress store). Default on. */
  track?: boolean
  /** The last part played to its end. */
  onEnded?: () => void
}

/**
 * A watch page's player without any look: the YouTube player across a VOD's parts (in `el`, once the component has
 * mounted), its state as refs, chat replay in step with it and watch progress. Call it from a component's setup and
 * bind `el` to the element the YouTube player goes in.
 *
 * `error` is set when the player can't load (the IFrame API is blocked, or the player isn't ready within 15s);
 * `status[i]` says why part i can't play (a part that fails isn't skipped: offer the next playable one).
 */
export function useWatchPlayer(opts: UseWatchPlayerOptions) {
  const timeline = () => toValue(opts.timeline)
  const start = opts.start ?? { index: 0, offset: 0 }

  const el = ref<HTMLElement | null>(null)
  /** VOD seconds; changes on every tick (about 4× a second) while playing. */
  const time = ref(timeline().toVod(start))
  const playing = ref(false)
  /** YouTube is loading video, or the player isn't ready yet. */
  const buffering = ref(true)
  const rate = ref(1)
  /** 0-100, and muted, as YouTube's player has them (it remembers them itself). */
  const volume = ref(100)
  const muted = ref(false)
  const partIndex = ref(start.index)
  const status = shallowRef<PartStatus[]>([])
  const error = ref<string | null>(null)
  let wp: WatchPlayer | null = null

  /** A YouTube player in `el` from `at`. A new one replaces the old (YouTube's controls are set when it's made). */
  function mount(at: Position, autoplay: boolean) {
    const old = wp
    const p = (wp = new WatchPlayer(timeline(), { skipBroken: false }))
    if (old) {
      p.status.splice(0, p.status.length, ...old.status) // what's known not to play stays known
      old.destroy()
    }
    status.value = [...p.status]
    p.on('time', (t) => (time.value = t))
    p.on('playing', (v) => (playing.value = v))
    p.on('buffering', (b) => (buffering.value = b))
    p.on('rate', (r) => (rate.value = r))
    p.on('volume', (v, m) => ((volume.value = v), (muted.value = m)))
    p.on('part', (i) => (partIndex.value = i))
    p.on('partError', () => (status.value = [...p.status]))
    p.on('ended', () => {
      playing.value = false
      opts.onEnded?.()
    })
    // A fresh element each time: YouTube replaces the one it's given with its iframe.
    const host = document.createElement('div')
    el.value!.replaceChildren(host)
    buffering.value = true
    mountYouTube(host, p, { start: at, autoplay, controls: toValue(opts.controls) ?? false })
      .then(() => {
        if (wp !== p) return
        buffering.value = false
        if (rate.value !== 1) p.setRate(rate.value)
      })
      .catch((e: Error) => {
        if (wp !== p) return
        buffering.value = false
        error.value = e.message || 'The YouTube player could not load.'
      })
  }
  onMounted(() => mount(start, opts.autoplay !== false))
  watch(
    () => toValue(opts.controls),
    () => wp && mount(timeline().locate(time.value), playing.value),
  )
  onScopeDispose(() => {
    wp?.destroy()
    wp = null
  })

  /** Jump to VOD time `t` (inside a restricted chapter: to its end). */
  function seek(t: number) {
    const to = timeline().watchable(t)
    time.value = to
    wp?.seek(to)
  }
  /** Play part `i` from its start. */
  function playPart(i: number) {
    if (wp) wp.playPart(i)
    else time.value = timeline().partSpans()[i]?.start ?? time.value
  }
  const play = () => wp?.play()
  const pause = () => wp?.pause()
  function togglePlay() {
    if (wp?.isPlaying()) wp.pause()
    else wp?.play()
  }
  function setVolume(v: number) {
    if (muted.value && v > 0) wp?.setMuted(false)
    wp?.setVolume(v)
  }
  const toggleMute = () => wp?.setMuted(!muted.value)
  const setRate = (r: number) => wp?.setRate(r)

  // The chats the VOD whose chat is showing has (on a synthetic VOD, the playing source's), once chat's first page
  // says (kept here, since useChat's own ref doesn't exist yet when its options are first read). Tagged with the VOD,
  // so the next VOD doesn't start from this one's.
  const knownSources = shallowRef<{ vodId: string; sources: ChatSources } | null>(null)
  const chatOpts = opts.chat
  const chat: ReturnType<typeof useChat> | null = chatOpts === false
    ? null
    : useChat({
        vodId: opts.vodId,
        time,
        playing,
        offset: chatOpts?.offset,
        segments: () => toValue(opts.segments) ?? null,
        chatSource: (): ChatSource | 'auto' =>
          chatSourceFor(
            toValue(chatOpts?.source) ?? 'auto',
            knownSources.value && knownSources.value.vodId === chat!.vodId.value ? knownSources.value.sources : null,
          ),
      })
  if (chat)
    watch(chat.sources, (s) => {
      if (s) knownSources.value = { vodId: chat.vodId.value, sources: s }
    })

  const progress = opts.track !== false ? useProgress({ vodId: opts.vodId, duration: opts.duration, time, playing }) : null
  /** Where the watch position last went (null: not saved yet, or not tracked). */
  const saved: Readonly<Ref<SaveStatus | null>> = progress?.status ?? shallowRef(null)

  return {
    el,
    time,
    playing,
    buffering,
    rate,
    volume,
    muted,
    partIndex,
    status,
    error,
    seek,
    playPart,
    play,
    pause,
    togglePlay,
    setVolume,
    toggleMute,
    setRate,
    /** useChat's refs, or null with `chat: false`. */
    chat,
    /** Where the viewer left off (useProgress), null when there's nothing to resume or `track: false`. */
    resume: progress?.resume ?? shallowRef(null),
    saved,
  }
}
