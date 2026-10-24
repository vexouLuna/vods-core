import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_OPTIONS, homeCardLabel, homeCardsOf, loadSiteOptions, shownHomeCards, siteOptions } from '../../src/app/lib/siteOptions'

describe('homeCardsOf', () => {
  it('keeps known cards in order, once each, and drops the rest', () => {
    expect(
      homeCardsOf([{ kind: 'games' }, { kind: 'tag', tag: 'compilation' }, { kind: 'games' }, { kind: 'tag', tag: 'Bad Tag' }, { kind: 'x' }, null, { kind: 'latest' }, { kind: 'one', tag: 'compilation' }]),
    ).toEqual([{ kind: 'games' }, { kind: 'tag', tag: 'compilation' }, { kind: 'latest' }, { kind: 'one', tag: 'compilation' }])
  })
  it('falls back to the defaults for a non-list', () => {
    expect(homeCardsOf(undefined)).toEqual(DEFAULT_SITE_OPTIONS.homeCards)
    expect(homeCardsOf([])).toEqual([])
  })
})

describe('shownHomeCards', () => {
  it("drops a tag card once its tag isn't a home category", () => {
    const tags = { pt: { label: 'pt', drawn: false, page: 'pt' }, old: { label: 'old', drawn: false, homeCard: true } }
    const cards = [{ kind: 'latest' }, { kind: 'tag', tag: 'pt' }, { kind: 'one', tag: 'old' }, { kind: 'tag', tag: 'gone' }, { kind: 'games' }] as const
    expect(shownHomeCards([...cards], tags)).toEqual([{ kind: 'latest' }, { kind: 'tag', tag: 'pt' }, { kind: 'games' }])
  })
})

describe('homeCardLabel', () => {
  it("names a tag card by its page label, then its label, then the tag", () => {
    const tags = { a: { label: 'x', drawn: false, pageLabel: 'Playthroughs' }, b: { label: 'Highlight', drawn: true } }
    expect(homeCardLabel({ kind: 'tag', tag: 'a' }, tags)).toBe('Latest 2: Playthroughs')
    expect(homeCardLabel({ kind: 'one', tag: 'b' }, tags)).toBe('Latest VOD: Highlight')
    expect(homeCardLabel({ kind: 'tag', tag: 'c' }, tags)).toBe('Latest 2: c')
    expect(homeCardLabel({ kind: 'latest' }, tags)).toBe('Latest live')
    expect(homeCardLabel({ kind: 'games' }, tags)).toBe('Most played games')
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
    expect(siteOptions.value).toEqual({ homeCards: [{ kind: 'games' }], playDefault: 'compiled' })
    await loadSiteOptions((async () => new Response(JSON.stringify({ playDefault: 'youtube' }))) as typeof fetch, 'https://api.test')
    expect(siteOptions.value.playDefault).toBe('segments')
    await loadSiteOptions((async () => new Response(JSON.stringify({ homeCards: [{ kind: 'games' }] }))) as typeof fetch, 'https://api.test')
    await loadSiteOptions((async () => new Response('', { status: 404 })) as typeof fetch, 'https://api.test')
    await loadSiteOptions((async () => Promise.reject(new Error('down'))) as typeof fetch, 'https://api.test')
    expect(siteOptions.value.homeCards).toEqual([{ kind: 'games' }])
    siteOptions.value = DEFAULT_SITE_OPTIONS
  })
})
