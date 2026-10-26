import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SITE_OPTIONS,
  homeCardLabel,
  homeCardsOf,
  legacyCards,
  loadSiteOptions,
  shownHomeCards,
  siteOptions,
  toLegacyCards,
  type HomeCard,
} from '../../src/app/lib/siteOptions'

describe('homeCardsOf', () => {
  it('maps the old shape, in order, and drops what it can’t read', () => {
    expect(
      homeCardsOf([{ kind: 'games' }, { kind: 'tag', tag: 'compilation' }, { kind: 'tag', tag: 'Bad Tag' }, { kind: 'x' }, null, { kind: 'latest' }, { kind: 'one', tag: 'compilation' }]),
    ).toEqual([
      { id: 'card-0', type: 'games' },
      { id: 'card-1', type: 'vods', tag: 'compilation', count: 2 },
      { id: 'card-5', type: 'live' },
      { id: 'card-6', type: 'vods', tag: 'compilation', count: 1 },
    ])
  })
  it('reads the new shape, keeping duplicates and giving a repeated or missing id a new one', () => {
    expect(
      homeCardsOf([
        { id: 'a', type: 'vods', tag: 'vods', count: 1 },
        { id: 'a', type: 'vods', tag: 'vods', count: 1 },
        { type: 'live' },
        { id: 'b', type: 'vods', tag: 'vods', count: 3 },
        { id: 'c', type: 'games' },
      ]),
    ).toEqual([
      { id: 'a', type: 'vods', tag: 'vods', count: 1 },
      { id: 'card-1', type: 'vods', tag: 'vods', count: 1 },
      { id: 'card-2', type: 'live' },
      { id: 'c', type: 'games' },
    ])
  })
  it('falls back to the defaults for a non-list', () => {
    expect(homeCardsOf(undefined)).toEqual(DEFAULT_SITE_OPTIONS.homeCards)
    expect(homeCardsOf([])).toEqual([])
  })
})

describe('legacy cards', () => {
  it('tells the old shape from the new', () => {
    expect(legacyCards([{ kind: 'games' }])).toBe(true)
    expect(legacyCards([])).toBe(true)
    expect(legacyCards([{ id: 'x', type: 'games' }])).toBe(false)
  })
  it('writes the old shape once each', () => {
    const cards: HomeCard[] = [
      { id: '1', type: 'live' },
      { id: '2', type: 'vods', tag: 'pt', count: 1 },
      { id: '3', type: 'vods', tag: 'pt', count: 1 },
      { id: '4', type: 'vods', tag: 'pt', count: 2 },
      { id: '5', type: 'games' },
    ]
    expect(toLegacyCards(cards)).toEqual([{ kind: 'latest' }, { kind: 'one', tag: 'pt' }, { kind: 'tag', tag: 'pt' }, { kind: 'games' }])
  })
})

describe('shownHomeCards', () => {
  it("drops a tag card once its tag isn't a home category, but always shows every VOD's", () => {
    const tags = { pt: { label: 'pt', drawn: false, page: 'pt' }, old: { label: 'old', drawn: false, homeCard: true } }
    const cards: HomeCard[] = [
      { id: '1', type: 'live' },
      { id: '2', type: 'vods', tag: 'pt', count: 2 },
      { id: '3', type: 'vods', tag: 'old', count: 1 },
      { id: '4', type: 'vods', tag: 'gone', count: 2 },
      { id: '5', type: 'vods', tag: 'vods', count: 1 },
      { id: '6', type: 'games' },
    ]
    expect(shownHomeCards(cards, tags).map((c) => c.id)).toEqual(['1', '2', '5', '6'])
  })
})

describe('homeCardLabel', () => {
  it('names a tag card by its page label, then its label, then the tag; vods is "All VODs"', () => {
    const tags = { a: { label: 'x', drawn: false, pageLabel: 'Playthroughs' }, b: { label: 'Highlight', drawn: true } }
    expect(homeCardLabel({ id: '1', type: 'vods', tag: 'a', count: 2 }, tags)).toBe('Latest 2: Playthroughs')
    expect(homeCardLabel({ id: '1', type: 'vods', tag: 'b', count: 1 }, tags)).toBe('Latest VOD: Highlight')
    expect(homeCardLabel({ id: '1', type: 'vods', tag: 'c', count: 2 }, tags)).toBe('Latest 2: c')
    expect(homeCardLabel({ id: '1', type: 'vods', tag: 'vods', count: 1 }, tags)).toBe('Latest VOD: All VODs')
    expect(homeCardLabel({ id: '1', type: 'live' }, tags)).toBe('Latest live')
    expect(homeCardLabel({ id: '1', type: 'games' }, tags)).toBe('Most played games')
  })
})

describe('loadSiteOptions', () => {
  it("takes the archive's cards and keeps them when a later fetch fails", async () => {
    const urls: string[] = []
    const ok = (async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ homeCards: [{ kind: 'games' }], playDefault: 'compiled' }))
    }) as typeof fetch
    await loadSiteOptions(ok, 'https://api.test/')
    expect(urls).toEqual(['https://api.test/v1/site/options'])
    expect(siteOptions.value).toEqual({ homeCards: [{ id: 'card-0', type: 'games' }], playDefault: 'compiled' })
    await loadSiteOptions((async () => new Response(JSON.stringify({ playDefault: 'youtube' }))) as typeof fetch, 'https://api.test')
    expect(siteOptions.value.playDefault).toBe('segments')
    await loadSiteOptions((async () => new Response(JSON.stringify({ homeCards: [{ id: 'g', type: 'games' }] }))) as typeof fetch, 'https://api.test')
    await loadSiteOptions((async () => new Response('', { status: 404 })) as typeof fetch, 'https://api.test')
    await loadSiteOptions((async () => Promise.reject(new Error('down'))) as typeof fetch, 'https://api.test')
    expect(siteOptions.value.homeCards).toEqual([{ id: 'g', type: 'games' }])
    siteOptions.value = DEFAULT_SITE_OPTIONS
  })
})
