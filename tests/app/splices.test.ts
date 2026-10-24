import type { Chapter } from '../../src/index'
import { describe, expect, it, vi } from 'vitest'
import { AdminClient, isSpliced, type Splice } from '../../src/app/admin/api'
import { gamesWithArt } from '../../src/app/lib/art'
import { cutNote } from '../../src/app/lib/cuts'

const reply = (status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))

describe('merge and split client', () => {
  it('posts the right bodies to /api/v2', async () => {
    const fetch = reply(201, { items: [] })
    const c = new AdminClient({ base: '', fetch })
    await c.mergeCandidates('A')
    await c.merge('A', { sources: ['B', 'C'], gaps: [null, 30] })
    await c.merge('A', { sources: ['B'], id: 'x' })
    await c.split('A', 3605)
    await c.split('A', 3605, ['a', 'b'])
    const calls = fetch.mock.calls.map(([url, init]) => [url, init?.method, init?.body && JSON.parse(init.body as string)])
    expect(calls).toEqual([
      ['/api/v2/vods/A/merge-candidates?hours=24', 'GET', undefined],
      ['/api/v2/vods/A/merge', 'POST', { sources: ['B', 'C'], gaps: [null, 30] }],
      ['/api/v2/vods/A/merge', 'POST', { sources: ['B'], id: 'x' }],
      ['/api/v2/vods/A/split', 'POST', { at: 3605 }],
      ['/api/v2/vods/A/split', 'POST', { at: 3605, ids: ['a', 'b'] }],
    ])
  })
})

describe('isSpliced', () => {
  const sp = (undoneAt: string | null): Splice => ({
    id: 1, kind: 'merge', vodId: 'A', otherId: 'B', offset: 100, gap: 10, detail: {}, createdAt: '', undoneAt, undoable: true,
  })
  it('is true while a merge or split stands, or when merged away', () => {
    expect(isSpliced({ splices: [] })).toBe(false)
    expect(isSpliced({ splices: [sp('2026-01-01')] })).toBe(false)
    expect(isSpliced({ splices: [sp('2026-01-01'), sp(null)] })).toBe(true)
    expect(isSpliced({ merged_into: { id: 'A', offset: 100 } })).toBe(true)
  })
})

describe('gap chapters', () => {
  const ch = (name: string, over: Partial<Chapter> = {}): Chapter => ({ name, image: null, gameId: null, start: 0, end: 1, restricted: false, ...over })
  it('are labelled apart from DMCA cuts', () => {
    expect(cutNote(ch('Game'))).toBeNull()
    expect(cutNote(ch('Game', { restricted: true }))?.label).toBe('cut')
    expect(cutNote(ch('Technical difficulties', { restricted: true, kind: 'gap' }))?.label).toBe('stream down')
  })
  it("aren't games", () => {
    expect(gamesWithArt([ch('A'), ch('Technical difficulties', { restricted: true, kind: 'gap' }), ch('A')]).map((g) => g.name)).toEqual(['A'])
  })
})
