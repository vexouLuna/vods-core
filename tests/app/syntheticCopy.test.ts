import { describe, expect, it } from 'vitest'
import type { SyntheticVod } from '../../src/app/admin/api'
import { copyId, copyOf, idProblem } from '../../src/app/lib/syntheticCopy'

const seg = (o: Record<string, unknown> = {}) => ({ vod_id: '1', start: 0, end: 60, at: 0, label: null, ...o })
const syn = (o: Partial<SyntheticVod> = {}) =>
  ({ id: 'elden-ring', title: 'Elden Ring', supersedes: false, tags: [], hidden: false, auto: null, segments: [seg()], ...o }) as unknown as SyntheticVod

describe('idProblem (the archive\'s compose.check_id)', () => {
  it.each(['elden-ring', 'a', 'x+y_z-1', '1a', 'a'.repeat(100)])('accepts %s', (id) => expect(idProblem(id)).toBeNull())
  it.each(['', '123', 'Elden', 'a b', '-a', '+a', '_a', 'a.b', 'a'.repeat(101)])('refuses %j', (id) => expect(idProblem(id)).not.toBeNull())
})

describe('copyId', () => {
  it('suggests <id>-copy, then numbers it', () => {
    expect(copyId('elden-ring', () => false)).toBe('elden-ring-copy')
    expect(copyId('elden-ring', (c) => c === 'elden-ring-copy')).toBe('elden-ring-copy-2')
    expect(copyId('elden-ring', (c) => ['elden-ring-copy', 'elden-ring-copy-2'].includes(c))).toBe('elden-ring-copy-3')
  })
  it('gives an id the archive accepts, also from a long or uppercase source', () => {
    for (const id of ['Elden Ring', 'a'.repeat(100), 'a'.repeat(100) + '-copy']) {
      const out = copyId(id, (c) => c.length < 0)
      expect(idProblem(out)).toBeNull()
    }
    expect(copyId('a'.repeat(100), (c) => c.endsWith('-copy'))).toMatch(/-copy-2$/)
  })
})

describe('copyOf', () => {
  it('keeps every segment gap whatever the kind (a playthrough included)', () => {
    const c = copyOf(syn({ tags: ['playthroughs'], segments: [seg(), seg({ vod_id: '2', at: 7200, gap_label: 'Stream was down' })] }))
    expect(c.rows.map((r) => r.at)).toEqual([0, 7200])
    expect(c.rows[1]!.gapLabel).toBe('Stream was down')
  })
  it('does not carry what would hide the sources, keep it refreshing, or the archive sets itself', () => {
    const c = copyOf(syn({ supersedes: true, auto: { game_ids: ['1'] }, tags: ['vods', 'compilation', 'new', 'speedrun'] }))
    expect(c.tags).toEqual(['speedrun'])
    expect(c).not.toHaveProperty('supersedes')
    expect(c).not.toHaveProperty('auto')
  })
  it('keeps the title, segment windows and labels', () => {
    const c = copyOf(syn({ segments: [seg({ start: 5, end: null, label: 'Part 1' })] }))
    expect(c).toMatchObject({ title: 'Elden Ring', rows: [{ vod_id: '1', start: 5, end: null, label: 'Part 1' }] })
  })
})
