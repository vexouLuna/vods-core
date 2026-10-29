// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { defineVodsConfig } from '../../src/config'
import { YT_STATE, type PlayerLike } from '../../src/player'
import { LocalProgressStore } from '../../src/progress'
import { Timeline } from '../../src/timeline'
import { createVods, useWatchPlayer } from '../../src/vue'
import { makeVod } from '../helpers'

type Events = { onReady: (e: { target: PlayerLike }) => void; onStateChange: (e: { data: number }) => void }

/** A stand-in for YT.Player that's ready at once; `made` keeps each one's playerVars and events. */
function fakeYouTube() {
  const made: { vars: Record<string, number>; events: Events; player: PlayerLike }[] = []
  function Player(this: unknown, _el: HTMLElement, o: { playerVars: Record<string, number>; events: Events }) {
    const s = { t: 0, state: YT_STATE.UNSTARTED as number }
    const player: PlayerLike = {
      loadVideoById: (_id, t = 0) => Object.assign(s, { t, state: YT_STATE.PLAYING }),
      cueVideoById: (_id, t = 0) => Object.assign(s, { t, state: YT_STATE.CUED }),
      seekTo: (t) => (s.t = t),
      playVideo: () => (s.state = YT_STATE.PLAYING),
      pauseVideo: () => (s.state = YT_STATE.PAUSED),
      getCurrentTime: () => s.t,
      getPlayerState: () => s.state,
      mute: () => undefined,
      unMute: () => undefined,
      isMuted: () => false,
      setVolume: () => undefined,
      getVolume: () => 80,
      setPlaybackRate: () => undefined,
      getPlaybackRate: () => 1,
      destroy: vi.fn(),
    }
    made.push({ vars: o.playerVars, events: o.events, player })
    queueMicrotask(() => o.events.onReady({ target: player }))
  }
  vi.stubGlobal('YT', { Player })
  return made
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

function mountWith(setup: () => ReturnType<typeof useWatchPlayer>) {
  let api!: ReturnType<typeof useWatchPlayer>
  const Comp = defineComponent({
    setup() {
      api = setup()
      return () => h('div', { ref: api.el })
    },
  })
  const config = defineVodsConfig({ channel: 'c', twitchId: '1', apiBase: 'https://api.example', startDate: '2024-01-01' })
  const app = createApp(Comp)
  app.use(createVods(config, { fetch: vi.fn(async () => new Response('{}', { status: 404 })), progress: new LocalProgressStore() }))
  app.mount(document.createElement('div'))
  return { api, app }
}

describe('useWatchPlayer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('mounts YouTube without its controls, follows its state, and makes a new player when they are switched on', async () => {
    const made = fakeYouTube()
    const ended = vi.fn()
    const controls = ref(false)
    const tl = new Timeline(makeVod({ duration: 200, parts: [100, 100] }))
    const { api, app } = mountWith(() =>
      useWatchPlayer({ vodId: 'v1', duration: 200, timeline: tl, controls, chat: false, track: false, onEnded: ended }),
    )
    await flush()
    expect(made).toHaveLength(1)
    expect(made[0]!.vars.controls).toBe(0)
    expect([api.buffering.value, api.volume.value]).toEqual([false, 80])

    made[0]!.events.onStateChange({ data: YT_STATE.BUFFERING })
    expect(api.buffering.value).toBe(true)
    made[0]!.events.onStateChange({ data: YT_STATE.PLAYING })
    expect([api.buffering.value, api.playing.value]).toEqual([false, true])

    api.seek(150)
    expect([api.time.value, api.partIndex.value]).toEqual([150, 1])

    controls.value = true
    await flush()
    expect(made).toHaveLength(2)
    expect(made[1]!.vars.controls).toBe(1)
    expect(made[0]!.player.destroy).toHaveBeenCalled()
    expect(api.partIndex.value).toBe(1)

    made[1]!.events.onStateChange({ data: YT_STATE.ENDED })
    expect(ended).toHaveBeenCalledOnce()
    app.unmount()
  })
})
