import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowReactive } from 'vue'
import { Timeline } from '../../src/timeline'
import type { AdminVod, MergeCandidate, SyntheticVod } from '../../src/app/admin/api'
import { admin } from '../../src/app/admin/session'
import { badGap, mergeOrder, splitJoins, useSplice } from '../../src/app/composables/useSplice'
import { fixtureVod, rawFixture } from '../helpers'

const flush = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => vi.restoreAllMocks())

describe('splice helpers', () => {
  it('offers a split after every part but the last', () => {
    const timeline = new Timeline(fixtureVod('vod-plain'))
    const spans = timeline.partSpans()
    expect(splitJoins(timeline)).toEqual(spans.slice(0, -1).map((s, i) => ({ at: Math.round(s.end), label: `after P${i + 1}` })))
    expect(splitJoins(null)).toEqual([])
  })

  it('takes an empty gap or 0+ seconds, and nothing else', () => {
    expect(badGap('')).toBe(false)
    expect(badGap('0')).toBe(false)
    expect(badGap('4:12')).toBe(false)
    expect(badGap('-3')).toBe(true)
    expect(badGap('soon')).toBe(true)
  })

  it('orders a merge by start and works out each gap', () => {
    const v = (id: string, at: string, duration: number) => ({ id, title: null, createdAt: at, duration })
    const { order, joins } = mergeOrder([v('c', '2026-01-01T03:00:00Z', 600), v('a', '2026-01-01T01:00:00Z', 3600), v('b', '2026-01-01T02:05:00Z', 1800)])
    expect(order.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(joins.map((j) => [j.key, j.gap])).toEqual([['a>b', 300], ['b>c', 1500]])
  })
})

describe('useSplice', () => {
  it('merges the picked VODs in start order with a gap per join, then opens the result', async () => {
    const vod = rawFixture<AdminVod>('vod-plain')
    const start = Date.parse(vod.createdAt)
    const cand = (id: string, offsetS: number, duration = '00:10:00'): MergeCandidate => ({
      id, stream_id: null, title: id, created_at: new Date(start + offsetS * 1000).toISOString(), duration, gap: 0, titles_match: true,
    })
    const before = cand('before', -7200, '01:00:00')
    vi.spyOn(admin, 'mergeCandidates').mockResolvedValue({ items: [before] })
    vi.spyOn(admin, 'vod').mockResolvedValue({ ...vod, id: 'later', createdAt: new Date(start + 86400_000).toISOString(), duration: '00:30:00' } as AdminVod)
    const merge = vi.spyOn(admin, 'merge').mockResolvedValue({ id: 'before-m' } as SyntheticVod)
    const made = vi.fn()
    const props = shallowReactive({ vod })
    const scope = effectScope()
    const sp = scope.run(() => useSplice(props, { made, notify: vi.fn() }))!
    await flush()
    expect(sp.suggestions.value.map((c) => c.id)).toEqual(['before'])

    sp.pick(before)
    sp.addDraft.value = 'later'
    await sp.addById()
    expect(sp.suggestions.value).toEqual([])
    expect(sp.order.value.map((v) => v.id)).toEqual(['before', vod.id, 'later'])
    expect(sp.mergeId.value).toBe('before-m')
    await nextTick()
    // Filled from the start times: before ends an hour before this one starts.
    expect(sp.gapDrafts.value['before>' + vod.id]).toBe('1:00:00')
    sp.gapDrafts.value['before>' + vod.id] = ''
    sp.mergeIdDraft.value = 'mine'

    await sp.merge()
    const [, body] = merge.mock.calls[0]!
    expect(body.sources).toEqual(['before', 'later'])
    expect(body.id).toBe('mine')
    expect(body.gaps![0]).toBeNull()
    expect(typeof body.gaps![1]).toBe('number')
    expect(made).toHaveBeenCalledWith('before-m')
    scope.stop()
  })

  it('splits with the default ids unless some are typed', async () => {
    vi.spyOn(admin, 'mergeCandidates').mockResolvedValue({ items: [] })
    const split = vi.spyOn(admin, 'split').mockResolvedValue([{ id: 'x-1' }, { id: 'x-2' }] as SyntheticVod[])
    const vod = rawFixture<AdminVod>('vod-plain')
    const scope = effectScope()
    const sp = scope.run(() => useSplice(shallowReactive({ vod }), { made: vi.fn(), notify: vi.fn() }))!
    sp.atDraft.value = '0:10:00'
    await sp.split()
    expect(split).toHaveBeenLastCalledWith(vod.id, 600, undefined)
    sp.atDraft.value = '0:10:00'
    sp.splitIdDrafts.value = ['', 'tail']
    await sp.split()
    expect(split).toHaveBeenLastCalledWith(vod.id, 600, [`${vod.id}-1`, 'tail'])
    scope.stop()
  })
})
