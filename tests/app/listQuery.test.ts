import { describe, expect, it } from 'vitest'
import type { Vod } from '../../src/index'
import { hasFilters, kindLabel, listPath, parseListQuery, tabOf, tabs, tagLink, toApiFilter, toListQuery } from '../../src/app/lib/listQuery'
import { RECENT_MS } from '../../src/app/lib/vodTags'

describe('parseListQuery', () => {
  it('defaults an empty query', () => {
    expect(parseListQuery({})).toEqual({ tab: 'vods', tag: '', page: 1, title: '', game: '', from: '', to: '' })
  })

  it('reads every filter and trims', () => {
    expect(parseListQuery({ title: ' chill ', game: 'Minecraft', from: '2025-01-02', to: '2025-02-03', page: '3' })).toEqual({
      tab: 'vods',
      tag: '',
      page: 3,
      title: 'chill',
      game: 'Minecraft',
      from: '2025-01-02',
      to: '2025-02-03',
    })
  })

  it('drops bad pages and dates', () => {
    const s = parseListQuery({ page: '-2', from: '2025-13-40', to: 'yesterday' })
    expect(s.page).toBe(1)
    expect(s.from).toBe('')
    expect(s.to).toBe('')
    expect(parseListQuery({ page: 'abc' }).page).toBe(1)
  })

  it('takes the first of repeated params', () => {
    expect(parseListQuery({ game: ['A', 'B'] }).game).toBe('A')
    expect(parseListQuery({ game: [null] }).game).toBe('')
  })
})

describe('toListQuery', () => {
  it('leaves out defaults', () => {
    expect(toListQuery(parseListQuery({}))).toEqual({})
  })

  it('round-trips', () => {
    const q = { title: 'x', game: 'Y', from: '2025-01-01', to: '2025-01-31', page: '2' }
    expect(toListQuery(parseListQuery(q))).toEqual(q)
  })

  it('takes the tab from the page, keeping it out of the query', () => {
    expect(parseListQuery({}, 'playthroughs').tab).toBe('playthroughs')
    expect(parseListQuery({ tab: 'playthroughs' }).tab).toBe('vods')
    expect(toListQuery(parseListQuery({ page: '2' }, 'playthroughs'))).toEqual({ page: '2' })
    expect(listPath('vods')).toBe('/vods')
    expect(listPath('playthroughs')).toBe('/playthroughs')
  })
})

describe('the tag filter', () => {
  it('takes the date tags in any tab, set tags only where VODs have them', () => {
    expect(parseListQuery({ tag: 'new' }).tag).toBe('new')
    expect(parseListQuery({ tag: 'updated' }, 'playthroughs').tag).toBe('updated')
    expect(parseListQuery({ tag: 'complete' }, 'playthroughs').tag).toBe('complete')
    // Plain VODs have no tags; a tab's own tag isn't a filter; nor is a bad name.
    expect(parseListQuery({ tag: 'complete' }).tag).toBe('')
    expect(parseListQuery({ tag: 'playthroughs' }, 'playthroughs').tag).toBe('')
    expect(parseListQuery({ tag: 'Bad Tag' }, 'playthroughs').tag).toBe('')
    expect(toListQuery(parseListQuery({ tag: 'complete' }, 'playthroughs'))).toEqual({ tag: 'complete' })
    expect(hasFilters(parseListQuery({ tag: 'new' }))).toBe(true)
  })

  it('asks the archive by live dates for new and updated, by tag for the rest', () => {
    const now = Date.UTC(2026, 9, 2, 12)
    const week = new Date(now - RECENT_MS)
    expect(toApiFilter(parseListQuery({ tag: 'new' }), now)).toMatchObject({ tag: undefined, firstLiveFrom: week })
    const updated = toApiFilter(parseListQuery({ tag: 'updated' }, 'playthroughs'), now)
    expect(updated).toMatchObject({ tag: 'playthroughs', firstLiveBefore: week, lastLiveFrom: week })
    expect(updated.tags).toBeUndefined()
    expect(toApiFilter(parseListQuery({ tag: 'complete' }, 'playthroughs'), now)).toMatchObject({ tag: 'playthroughs', tags: ['complete'] })
  })

  it("links a VOD's tag to its own tab", () => {
    const vod = (tags: string[]) => ({ tags }) as unknown as Vod
    expect(tabOf(vod(['playthroughs', 'complete']))).toBe('playthroughs')
    expect(tagLink(vod(['playthroughs', 'complete']), 'complete')).toBe('/playthroughs?tag=complete')
    expect(tagLink(vod([]), 'new')).toBe('/vods?tag=new')
    expect(tagLink(vod(['complete']), 'complete')).toBeNull()
  })
})

describe('toApiFilter', () => {
  it('covers whole local days', () => {
    const f = toApiFilter(parseListQuery({ from: '2025-03-01', to: '2025-03-02' }))
    expect(f.from).toEqual(new Date(2025, 2, 1, 0, 0, 0, 0))
    expect(f.to).toEqual(new Date(2025, 2, 2, 23, 59, 59, 999))
  })

  it('omits empty filters', () => {
    expect(toApiFilter(parseListQuery({}, 'playthroughs')).tag).toBe('playthroughs')
    expect(toApiFilter(parseListQuery({}))).toEqual({ tag: undefined, title: undefined, game: undefined, from: undefined, to: undefined })
  })
})

describe('hasFilters', () => {
  it('ignores the page and the tab', () => {
    expect(hasFilters(parseListQuery({ page: '4' }, 'playthroughs'))).toBe(false)
    expect(hasFilters(parseListQuery({ game: 'A' }))).toBe(true)
  })
})

describe('tabs', () => {
  it('puts /vods first: the vods tag when there is one, else the default list', () => {
    const pt = { label: 'pt', drawn: false, page: 'playthroughs', pageLabel: 'Playthroughs' }
    expect(tabs({ playthroughs: pt }).map((t) => [t.value, t.tag])).toEqual([['vods', undefined], ['playthroughs', 'playthroughs']])
    const withVods = tabs({ playthroughs: pt, vods: { label: 'VOD', drawn: false, page: 'vods', pageLabel: 'All VODs' } })
    expect(withVods.map((t) => [t.value, t.tag, t.label])).toEqual([['vods', 'vods', 'All VODs'], ['playthroughs', 'playthroughs', 'Playthroughs']])
  })
  it('never calls a VOD "a VOD"', () => {
    const vod = (tags: string[]) => ({ tags }) as unknown as Vod
    expect(kindLabel(['vods'])).toBeUndefined()
    expect(tabOf(vod(['vods', 'playthroughs']))).toBe('playthroughs')
  })
})
