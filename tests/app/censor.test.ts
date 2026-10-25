import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { AdminClient } from '../../src/app/admin/api'
import { censorDrafts, censorEdits, censorErrors, censoredSeconds, duplicateCensor, fitRegion, newCensor, REGION_MIN } from '../../src/app/admin/edits'
import { HEARTBEAT_MS, TAB_LEASE, useMediaLease } from '../../src/app/admin/preview/useMediaLease'
import { admin } from '../../src/app/admin/session'

describe('censor drafts', () => {
  it('round-trip ranges, sorted, with notes trimmed and empty ones dropped', () => {
    const drafts = censorDrafts([
      { start: 300, end: 360, video: null, mute: true },
      { start: 10, end: 20, video: 'blur', mute: false, note: 'menu' },
    ])
    expect(drafts.map((d) => d.video)).toEqual(['none', 'blur'])
    drafts[0]!.note = '  song  '
    drafts[1]!.note = '   '
    expect(censorEdits(drafts)).toEqual([
      { start: 10, end: 20, video: 'blur', mute: false },
      { start: 300, end: 360, video: null, mute: true, note: 'song' },
    ])
  })

  it('check what the worker checks', () => {
    const [ok, empty, back, late, nothing] = censorDrafts([
      { start: 0, end: 10, video: 'black', mute: false },
      { start: 0, end: 10, video: 'blur', mute: false },
      { start: 50, end: 40, video: 'blur', mute: false },
      { start: 50, end: 900, video: 'blur', mute: false },
      { start: 5, end: 10, video: null, mute: false },
    ])
    empty!.end = null
    const errors = censorErrors([ok!, empty!, back!, late!, nothing!], 600)
    expect(errors.has(ok!.key)).toBe(false)
    expect(errors.get(empty!.key)).toMatch(/required/)
    expect(errors.get(back!.key)).toMatch(/after the start/)
    expect(errors.get(late!.key)).toMatch(/after the VOD/)
    expect(errors.get(nothing!.key)).toMatch(/mute/)
  })

  it('start a new range after the last, inside the VOD', () => {
    const rows = censorDrafts([{ start: 0, end: 100, video: 'blur', mute: false }])
    expect(newCensor(rows, 600)).toMatchObject({ start: 100, end: 160, video: 'blur', mute: false })
    expect(newCensor(censorDrafts([{ start: 0, end: 590, video: 'blur', mute: false }]), 600)).toMatchObject({ start: 540, end: 600 })
  })

  it('count overlapping ranges once', () => {
    expect(censoredSeconds([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 100, end: 110 }])).toBe(25)
    expect(censoredSeconds([])).toBe(0)
  })
})

describe('AdminClient censor and re-archive', () => {
  it('saves ranges, deletes uploads and re-archives', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ error: false, msg: 'ok' }), { status: 200 }))
    const c = new AdminClient({ base: '/b/', fetch })
    await c.saveCensor('7', [{ start: 0, end: 5, video: 'black', mute: true }])
    await c.deleteUploads('7', ['abc'])
    await c.rearchive('7', { type: 'live', part: 2 })
    const calls = fetch.mock.calls.map(([url, init]) => [url, init!.method, JSON.parse(String(init!.body))])
    expect(calls).toEqual([
      ['/b/admin/vods/7/censor', 'PUT', { censor: [{ start: 0, end: 5, video: 'black', mute: true }] }],
      ['/b/admin/vods/7/youtube/delete', 'POST', { videos: ['abc'] }],
      ['/b/admin/vods/7/rearchive', 'POST', { type: 'live', part: 2 }],
    ])
  })
})

describe('censor boxes and colours', () => {
  it('carry the colour and the box through, rounded, and only where they mean something', () => {
    const [fill, boxed] = censorDrafts([
      { start: 0, end: 5, video: 'color', color: '#FF8800', mute: false },
      { start: 1, end: 2, video: 'pixelate', region: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, mute: true },
    ])
    expect(fill).toMatchObject({ video: 'color', color: '#FF8800', region: null })
    boxed!.region = { x: 0.123456, y: 0.2, w: 0.3, h: 0.4 }
    expect(censorEdits([fill!, boxed!])).toEqual([
      { start: 0, end: 5, video: 'color', color: '#ff8800', mute: false },
      { start: 1, end: 2, video: 'pixelate', region: { x: 0.1235, y: 0.2, w: 0.3, h: 0.4 }, mute: true },
    ])
    fill!.video = 'blur' // the colour stays in the draft for switching back, but isn't saved
    boxed!.video = 'none' // a box without a cover isn't saved either (and is flagged)
    expect(censorEdits([fill!, boxed!]).map((r) => [r.color, r.region])).toEqual([[undefined, undefined], [undefined, undefined]])
    expect(censorErrors([boxed!], 600).get(boxed!.key)).toMatch(/needs a cover/)
  })

  it('check boxes and colours as the worker does', () => {
    const rows = censorDrafts([
      { start: 0, end: 5, video: 'color', mute: false },
      { start: 0, end: 5, video: 'blur', region: { x: 0.6, y: 0, w: 0.5, h: 0.5 }, mute: false },
      { start: 0, end: 5, video: 'blur', region: { x: 0, y: 0, w: 0.005, h: 0.5 }, mute: false },
      { start: 0, end: 5, video: 'black', region: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, mute: false },
    ])
    rows[0]!.color = 'red'
    const errors = censorErrors(rows, 600)
    expect(errors.get(rows[0]!.key)).toMatch(/colour/)
    expect(errors.get(rows[1]!.key)).toMatch(/past the edge/)
    expect(errors.get(rows[2]!.key)).toMatch(/too small/)
    expect(errors.has(rows[3]!.key)).toBe(false)
  })

  it('keep a drawn box inside the frame and duplicate it beside itself', () => {
    expect(fitRegion({ x: 0.9, y: -0.2, w: 0.3, h: 0.001 })).toEqual({ x: 0.7, y: 0, w: 0.3, h: REGION_MIN })
    const [r] = censorDrafts([{ start: 0, end: 5, video: 'blur', region: { x: 0.9, y: 0.1, w: 0.1, h: 0.1 }, mute: false }])
    const copy = duplicateCensor(r!)
    expect(copy.key).not.toBe(r!.key)
    expect(copy.region).toEqual({ x: 0.9, y: 0.15, w: 0.1, h: 0.1 })
    copy.region!.x = 0
    expect(r!.region!.x).toBe(0.9) // its own box
    expect(newCensor([r!], 600, 42)).toMatchObject({ start: 42, end: 102 })
  })
})

describe('the media lease', () => {
  const problem = (status: number, code: string, holder: unknown) =>
    new Response(JSON.stringify({ status, code, detail: code, holder }), { status, headers: { 'content-type': 'application/problem+json' } })
  const HOLDER = { login: 'vexoul', kind: 'twitch', browser: 'Firefox on Windows', vod_id: '7', file: 'source', acquired_at: '2026-10-24T10:00:00Z', heartbeat_at: '2026-10-24T10:00:00Z', yours: false }

  it('claims, heartbeats, loses it to another tab and takes it back', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', new EventTarget())
    const answers: Response[] = [
      problem(409, 'media_in_use', HOLDER),
      new Response(JSON.stringify({ ...HOLDER, yours: true }), { status: 200 }),
      new Response(null, { status: 204 }),
      problem(410, 'lease_lost', { ...HOLDER, browser: 'Chrome on Linux' }),
      new Response(JSON.stringify({ ...HOLDER, yours: true }), { status: 200 }),
      new Response(null, { status: 204 }),
    ]
    const calls: [string, string, unknown][] = []
    vi.spyOn(admin as unknown as { fetcher: (u: string, i?: RequestInit) => Promise<Response> }, 'fetcher').mockImplementation(async (url, init) => {
      calls.push([url, init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : (init?.keepalive ?? null)])
      return answers.shift()!
    })
    const scope = effectScope()
    const l = scope.run(() => useMediaLease(() => '7'))!
    expect(await l.claim('source')).toBe(false)
    expect([l.state.value, l.holder.value?.browser]).toEqual(['in_use', 'Firefox on Windows'])
    expect(await l.claim('source', true)).toBe(true)
    expect(l.state.value).toBe('held')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS) // renewed
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS) // taken
    expect([l.state.value, l.holder.value?.browser]).toEqual(['lost', 'Chrome on Linux'])
    expect(await l.claim('source', true)).toBe(true)
    scope.stop() // unmounted: released with keepalive
    await vi.runOnlyPendingTimersAsync()
    expect(calls.map(([u, m]) => `${m} ${u.replace(admin.base, '').replace(/\/media\/lease\/[^/]+$/, '/media/lease/ID')}`)).toEqual([
      'POST /api/v2/media/lease',
      'POST /api/v2/media/lease',
      'PUT /api/v2/media/lease/ID',
      'PUT /api/v2/media/lease/ID',
      'POST /api/v2/media/lease',
      'DELETE /api/v2/media/lease/ID',
    ])
    expect(calls[1]![2]).toEqual({ lease_id: TAB_LEASE, vod_id: '7', file: 'source', take_over: true })
    expect(calls[5]![2]).toBe(true)
    expect(admin.mediaUrl('7', 'censored', 'abc')).toMatch(/\/api\/v2\/vods\/7\/media\/censored\?lease=abc$/)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
