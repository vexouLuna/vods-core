import { beforeEach, describe, expect, it } from 'vitest'
import { Timeline } from '../../src/timeline'
import { AUTO_CONTINUE } from '../../src/app/composables/useWatchView'
import { backToPreferred, clearFailed, markFailed, preferredTrack, setPreferredTrack, timelineHas, trackLabel, trackStep, type Track } from '../../src/app/lib/tracks'
import { makeVod } from '../helpers'

// Two tracks over 0-3600: live has one hour-long video, VOD two half-hour ones.
const live = new Timeline(makeVod({ duration: 3600, parts: [3600], type: 'live' }), 'live')
const vod = new Timeline(makeVod({ duration: 3600, parts: [1800, 1800], type: 'vod' }), 'vod')
const track = (type: 'live' | 'vod', has: (t: number) => boolean): Track => ({ type, label: type, to: (t) => `/${type}/x?t=${t}`, has })
const tracks = [track('live', (t) => timelineHas(live, 'live', t)), track('vod', (t) => timelineHas(vod, 'vod', t))]

beforeEach(() => {
  clearFailed()
  setPreferredTrack('live')
})

describe('timelineHas', () => {
  it("is true where the track has an upload of its own, false past it and while it's processing", () => {
    expect(timelineHas(vod, 'vod', 2000)).toBe(true)
    expect(timelineHas(vod, 'vod', 3600)).toBe(false)
    expect(timelineHas(vod, 'live', 2000)).toBe(false)
    const processing = new Timeline(makeVod({ duration: 3600, parts: [null], type: 'live' }), 'live')
    expect(timelineHas(processing, 'live', 100)).toBe(false)
  })
})

describe('trackStep', () => {
  it('switches to the other track that has the moment, after the handoff timer', () => {
    markFailed('x', 'live', { start: 0, end: 3600 })
    expect(trackStep('x', tracks, 'live', 2000, -1, AUTO_CONTINUE)).toMatchObject({ kind: 'switch', track: { type: 'vod' }, seconds: AUTO_CONTINUE })
  })

  it('never switches back to a track that also had no source there: the next part after twice the timer', () => {
    markFailed('x', 'live', { start: 0, end: 3600 })
    markFailed('x', 'vod', { start: 1800, end: 3600 })
    expect(trackStep('x', tracks, 'vod', 2000, 2, AUTO_CONTINUE)).toEqual({ kind: 'next', part: 2, seconds: AUTO_CONTINUE * 2 })
  })

  it('goes back to a track that failed elsewhere, and does nothing with no track and no part left', () => {
    markFailed('x', 'live', { start: 0, end: 1000 })
    expect(trackStep('x', tracks, 'vod', 2000, -1, AUTO_CONTINUE)).toMatchObject({ kind: 'switch', track: { type: 'live' } })
    expect(trackStep('x', [tracks[1]!], 'vod', 2000, -1, AUTO_CONTINUE)).toBeNull()
  })

  it("remembers failures per VOD and skips a track that hasn't the moment", () => {
    markFailed('other', 'vod', { start: 0, end: 3600 })
    expect(trackStep('x', tracks, 'live', 2000, 1, AUTO_CONTINUE)).toMatchObject({ kind: 'switch', track: { type: 'vod' } })
    expect(trackStep('x', [tracks[0]!, track('vod', () => false)], 'live', 2000, 1, AUTO_CONTINUE)).toEqual({ kind: 'next', part: 1, seconds: 16 })
  })
})

describe("the viewer's track", () => {
  it('is Unmuted (live) until picked by hand, and the labels say Unmuted / Muted', () => {
    expect(preferredTrack.value).toBe('live')
    expect([trackLabel('live'), trackLabel('vod')]).toEqual(['Unmuted', 'Muted'])
  })

  it('a fallback holds for its part only: the next part goes back to the picked track', () => {
    markFailed('x', 'live', { start: 0, end: 1800 })
    // still on the failed part: stay on the fallback
    expect(backToPreferred('x', tracks, 'vod', 1000)).toBeNull()
    // next part: back to Unmuted
    expect(backToPreferred('x', tracks, 'vod', 1800)).toMatchObject({ type: 'live' })
    expect(backToPreferred('x', tracks, 'live', 1800)).toBeNull()
  })

  it('works the other way round once Muted is picked', () => {
    setPreferredTrack('vod')
    markFailed('x', 'vod', { start: 0, end: 1800 })
    expect(backToPreferred('x', tracks, 'live', 1000)).toBeNull()
    expect(backToPreferred('x', tracks, 'live', 2000)).toMatchObject({ type: 'vod' })
    expect(backToPreferred('x', [tracks[0]!], 'live', 2000)).toBeNull()
  })
})
