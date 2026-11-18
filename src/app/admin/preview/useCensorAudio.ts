// The preview's sound as the worker will make it (censorRender.soundAt): the file's own audio, silence, or a library
// song looped from its range's start at its volume, then each muffle after it as ffmpeg's MUFFLE (two 400 Hz low-passes,
// 1.5x louder). Web Audio on the <video>, which works because the admin API is on the page's own origin; it starts on
// the first Play (browsers only allow sound after a click), and until then the video plays its own sound as before.
import { onBeforeUnmount, watch, type Ref } from 'vue'
import type { CensorDraft } from '../edits'
import { soundAt, type SoundNow } from './censorRender'

/** ffmpeg's lowpass default: 2 poles, Q 0.707; Web Audio gives a low-pass's Q in dB. */
const LOWPASS_Q_DB = 20 * Math.log10(Math.SQRT1_2)
/** A song this far off where the worker would have it is moved there. */
const DRIFT = 0.25

export function useCensorAudio(opts: {
  video: Ref<HTMLVideoElement | null>
  /** Apply the drafts (off for a file that already has them burned in, or with the drafts hidden). */
  on: () => boolean
  rows: () => readonly CensorDraft[]
  time: () => number
  playing: () => boolean
  songUrl: (id: string) => string
}) {
  let ctx: AudioContext | null = null
  let stream: GainNode
  let songGain: GainNode
  let mix: GainNode
  let chain: AudioNode[] = []
  const song = new Audio()
  song.loop = true
  song.preload = 'auto'
  let songId = ''

  /** Called from Play (a click): wires the video and the song through the graph once, and wakes the context. */
  function start() {
    const v = opts.video.value
    if (!v) return
    if (!ctx) {
      ctx = new AudioContext()
      stream = ctx.createGain()
      songGain = ctx.createGain()
      mix = ctx.createGain()
      ctx.createMediaElementSource(v).connect(stream).connect(mix)
      ctx.createMediaElementSource(song).connect(songGain).connect(mix)
      mix.connect(ctx.destination)
    }
    void ctx.resume()
    apply()
  }

  function muffle(n: number) {
    if (!ctx || chain.length === n * 3) return
    mix.disconnect()
    for (const node of chain) node.disconnect()
    chain = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) chain.push(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 400, Q: LOWPASS_Q_DB }))
      chain.push(new GainNode(ctx, { gain: 1.5 }))
    }
    let at: AudioNode = mix
    for (const node of chain) at = at.connect(node)
    at.connect(ctx.destination)
  }

  function apply() {
    if (!ctx) return
    const t = opts.time()
    const now: SoundNow = opts.on() ? soundAt(opts.rows(), t) : { base: 'stream', muffles: 0 }
    stream.gain.value = now.base === 'stream' ? 1 : 0
    muffle(now.muffles)
    if (now.base !== 'song' || !now.song) {
      song.pause()
      return
    }
    if (songId !== now.song.id) {
      songId = now.song.id
      song.src = opts.songUrl(songId)
    }
    songGain.gain.value = now.song.volume
    const at = Number.isFinite(song.duration) && song.duration > 0 ? (t - now.song.start) % song.duration : t - now.song.start
    if (Math.abs(song.currentTime - at) > DRIFT) song.currentTime = at
    if (opts.playing() && song.paused) void song.play().catch(() => {})
    else if (!opts.playing()) song.pause()
  }

  watch(() => [opts.time(), opts.playing(), opts.on(), opts.rows().map((r) => [r.start, r.end, r.sound, r.song, r.volume])], apply, { deep: true })
  onBeforeUnmount(() => {
    song.pause()
    song.removeAttribute('src')
    void ctx?.close()
  })
  return { start }
}
