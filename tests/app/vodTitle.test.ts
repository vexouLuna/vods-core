import { afterEach, describe, expect, it } from 'vitest'
import type { Vod } from '../../src/index'
import { site } from '../../src/app/site'
import { cutInFull } from '../../src/app/lib/cuts'
import { generatedTitle, setTitleMode, titleMode, vodTitle } from '../../src/app/lib/vodTitle'

const ch = (name: string, extra: object = {}) => ({ name, start: 0, end: 1, restricted: false, ...extra })
const vod = (chapters: object[], tags: string[] = []) =>
  ({ title: 'THE LARP NEVER ENDS', createdAt: new Date(2026, 9, 28, 20), chapters, tags }) as unknown as Vod

describe('vodTitle', () => {
  afterEach(() => {
    site.vodTitle = 'original'
    setTitleMode('original')
  })

  it('makes a title from the date and games, without gaps or uncategorised chapters', () => {
    const v = vod([ch('Alien: Isolation'), ch('Technical difficulties', { kind: 'gap' }), ch('No category'), ch('League of Legends'), ch('Alien: Isolation')])
    expect(generatedTitle(v, 'en-US')).toBe('Wed, Oct 28, 2026 · Alien: Isolation + League of Legends')
    expect(generatedTitle(vod([ch('A'), ch('B'), ch('C'), ch('D')]), 'en-US')).toBe('Wed, Oct 28, 2026 · A, B + 2 more')
    expect(generatedTitle(vod([]), 'en-US')).toBe('Wed, Oct 28, 2026')
  })

  it("follows the site's default until the viewer picks, and leaves a playthrough's title alone", () => {
    const v = vod([ch('Alien: Isolation')])
    expect(vodTitle(v)).toBe('THE LARP NEVER ENDS')
    site.vodTitle = 'generated'
    expect(titleMode()).toBe('generated')
    expect(vodTitle(v)).toMatch(/Alien: Isolation$/)
    setTitleMode('original')
    expect(vodTitle(v)).toBe('THE LARP NEVER ENDS')
    expect(vodTitle(vod([ch('X')], ['playthroughs']), 'generated')).toBe('THE LARP NEVER ENDS')
  })
})

describe('cutInFull', () => {
  it('is every chapter restricted, and not an empty list', () => {
    expect(cutInFull(vod([ch('A', { restricted: true }), ch('B', { restricted: true })]))).toBe(true)
    expect(cutInFull(vod([ch('A', { restricted: true }), ch('B')]))).toBe(false)
    expect(cutInFull(vod([]))).toBe(false)
  })
})
