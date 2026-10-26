import type { RawChapter } from '../../src/index'
import { describe, expect, it } from 'vitest'
import {
  chapterDrafts,
  chapterEdits,
  chapterErrors,
  chapterGaps,
  detailsDraft,
  detailsErrors,
  detailsPatch,
  driveId,
  formatTime,
  gameDrafts,
  gameEdits,
  gameErrors,
  gamesFromChapters,
  headerDraft,
  headerErrors,
  headerPatch,
  hhmmss,
  lockedTags,
  parseTime,
  templateOf,
  youtubeDrafts,
  youtubeEdits,
  youtubeErrors,
  youtubeId,
} from '../../src/app/admin/edits'
import { fromDraft, settingChanges, showValue, toDraft } from '../../src/app/admin/settings'
import type { AdminVod, RuntimeSetting } from '../../src/app/admin/api'

const raw = (over: Partial<RawChapter>): RawChapter => ({ name: 'Game', gameId: '1', start: 0, end: 100, ...over })

describe('chapter drafts', () => {
  it('turn the API length-as-end into absolute ends, and back into lengths sorted by start', () => {
    const drafts = chapterDrafts([raw({ start: 100, end: 50, name: 'B' }), raw({ start: 0, end: 100, name: 'A' })])
    expect(drafts.map((d) => [d.start, d.end])).toEqual([[100, 150], [0, 100]])
    expect(chapterEdits(drafts)).toEqual([
      { name: 'A', gameId: '1', imageTemplate: null, start: 0, length: 100, restricted: false },
      { name: 'B', gameId: '1', imageTemplate: null, start: 100, length: 50, restricted: false },
    ])
  })

  it("keep a merge's gap chapter a gap chapter", () => {
    const drafts = chapterDrafts([raw({}), raw({ name: 'Technical difficulties', gameId: null, start: 100, end: 60, restricted: true, kind: 'gap' })])
    expect(chapterEdits(drafts).map((e) => e.kind)).toEqual([undefined, 'gap'])
  })

  it('keep uncategorised chapters as null and derive templates from baked-in box art', () => {
    const [d] = chapterDrafts([raw({ name: null, gameId: null, image: 'https://static-cdn.jtvnw.net/ttv-boxart/1-40x53.jpg' })])
    expect(d).toMatchObject({ name: null, gameId: null, imageTemplate: 'https://static-cdn.jtvnw.net/ttv-boxart/1-{width}x{height}.jpg' })
    expect(templateOf('https://x/{width}x{height}.jpg')).toBe('https://x/{width}x{height}.jpg')
    expect(templateOf('https://x/no-size.jpg')).toBeNull()
  })

  it('flag the same problems the worker rejects', () => {
    const [a, b, c, d] = chapterDrafts([
      raw({ start: 0, end: 100 }),
      raw({ start: 90, end: 20 }), // overlaps a
      raw({ start: 200, end: 0 }), // zero length
      raw({ start: 300, end: 900 }), // past the end
    ])
    const errors = chapterErrors([a!, b!, c!, d!], 1000)
    expect(errors.has(a!.key)).toBe(false)
    expect(errors.get(b!.key)).toMatch(/Overlaps/)
    expect(errors.get(c!.key)).toMatch(/after the start/)
    expect(errors.get(d!.key)).toMatch(/Ends after the VOD/)
    // Touching chapters and unsorted rows are fine.
    const ok = chapterDrafts([raw({ start: 100, end: 50 }), raw({ start: 0, end: 100 })])
    expect(chapterErrors(ok, 150).size).toBe(0)
  })

  it('find stretches no chapter covers', () => {
    const drafts = chapterDrafts([raw({ start: 10, end: 20 }), raw({ start: 50, end: 10 })])
    expect(chapterGaps(drafts, 100)).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 50 },
      { start: 60, end: 100 },
    ])
  })
})

describe('times', () => {
  it('parse clock, h/m/s and plain seconds', () => {
    expect(parseTime('1:02:03')).toBe(3723)
    expect(parseTime('62:03')).toBe(3723)
    expect(parseTime('1h2m3s')).toBe(3723)
    expect(parseTime('3723')).toBe(3723)
    expect(parseTime('1:2:x')).toBeNaN()
    expect(parseTime('')).toBeNaN()
    expect(formatTime(3723)).toBe('1:02:03')
    expect(formatTime(3723.25)).toBe('1:02:03.250')
  })
})

describe('uploads', () => {
  it('read ids from URLs', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId(' dQw4w9WgXcQ ')).toBe('dQw4w9WgXcQ')
    expect(driveId('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing')).toBe('1AbCdEfGhIjKlMn')
  })

  it('reject duplicate videos and parts, and send only known durations', () => {
    const rows = youtubeDrafts([
      { id: 'a', type: 'vod', part: 2, duration: 100 },
      { id: 'b', type: 'vod', part: 1, duration: null },
      { id: 'c', type: 'live', part: 1 },
    ])
    expect(youtubeErrors(rows).size).toBe(0)
    expect(youtubeEdits(rows)).toEqual([
      { id: 'b', type: 'vod', part: 1 },
      { id: 'a', type: 'vod', part: 2, duration: 100 },
      { id: 'c', type: 'live', part: 1 },
    ])
    rows[2]!.type = 'vod'
    rows[2]!.part = 2
    expect([...youtubeErrors(rows).values()]).toEqual(['There is already a vod part 2.'])
  })
})

const vod = (over: Partial<AdminVod> = {}): AdminVod =>
  ({ id: '1', title: 'Old', thumbnail_url: null, duration: '01:00:00', duration_seconds: 3600, createdAt: '2026-09-01T20:00:00.000Z', chapters: [], ...over }) as AdminVod

describe('details draft', () => {
  it('sends only what changed, with the default thumbnail as null and the duration as HH:MM:SS', () => {
    const v = vod({ thumbnail_url: 'https://x/t.jpg' })
    const d = detailsDraft(v)
    expect(detailsPatch(d, v)).toEqual({})
    d.thumbnailUrl = ''
    d.duration = 3725
    expect(detailsPatch(d, v)).toEqual({ thumbnailUrl: null, duration: '01:02:05' })
  })

  it('checks the URL, duration against the content, and the date', () => {
    const d = { ...detailsDraft(vod()), thumbnailUrl: 'ftp://x', createdAt: 'nope' }
    expect([...detailsErrors(d).keys()]).toEqual(['thumbnailUrl', 'createdAt'])
    expect(detailsErrors(detailsDraft(vod()), 4000).get('duration')).toMatch(/shorten/)
    expect(hhmmss(100 * 3600 + 1)).toBe('100:00:01')
  })

  it('takes only the thumbnail of a synthetic VOD', () => {
    const v = vod({ synthetic: { supersedes: false, segments: [] } })
    const d = { ...detailsDraft(v), thumbnailUrl: 'https://x/s.jpg', duration: 10, createdAt: 'nope' }
    expect([...detailsErrors(d, 4000, true).keys()]).toEqual([])
    expect(detailsPatch(d, v)).toEqual({ thumbnailUrl: 'https://x/s.jpg' })
  })
})

describe('header draft', () => {
  it('sends the title, the cut reason (empty as null) and only what changed', () => {
    const v = vod({ cut_reason: 'Music claim' })
    const d = headerDraft(v)
    expect(d.cutReason).toBe('Music claim')
    expect(headerPatch(d, v)).toEqual({})
    d.title = '  New  '
    d.cutReason = '  '
    expect(headerPatch(d, v)).toEqual({ title: 'New', cutReason: null })
    expect(headerErrors({ ...d, title: ' ', cutReason: 'x'.repeat(501) }).get('cutReason')).toMatch(/500/)
    expect([...headerErrors({ ...d, title: ' ' }).keys()]).toEqual(['title'])
  })

  it('edits only the own tags, and sends the stored automatic ones along', () => {
    const v = vod({ tags: ['vods', 'compilation', 'complete'] })
    const d = headerDraft(v)
    expect(d.tags).toEqual(['complete'])
    d.tags = ['complete']
    expect(headerPatch(d, v)).toEqual({})
    d.tags = ['playthroughs']
    expect(headerPatch(d, v)).toEqual({ tags: ['vods', 'compilation', 'playthroughs'] })
  })

  it('locks the states first, then the automatic tags', () => {
    const now = Date.parse('2026-09-03T00:00:00Z')
    const v = vod({ hidden: true, tags: ['vods', 'complete'], merged_into: { id: '2', offset: 0 } })
    expect(lockedTags(v, now).map((l) => l.value)).toEqual(['hidden', 'merged', 'new', 'vods'])
    const s = vod({ tags: ['compilation'], synthetic: { supersedes: true, segments: [] } })
    expect(lockedTags(s, now + 30 * 86400_000).map((l) => l.value)).toEqual(['merge or split', 'compilation'])
  })
})

describe('games draft', () => {
  const row = { start_time: '60', end_time: 120, game_id: '9', game_name: 'Doom', chapter_image: 'https://img/box-40x53.jpg', video_id: 'yt' }

  it('round-trips a row, keeping its box art and other fields, sorted by start', () => {
    const drafts = gameDrafts([row, { ...row, start_time: 0, end_time: 60, game_name: 'Quake', chapter_image: undefined }])
    const out = gameEdits(drafts)
    expect(out.map((r) => r.game_name)).toEqual(['Quake', 'Doom'])
    expect(out[1]).toMatchObject({ start_time: 60, end_time: 120, chapter_image: row.chapter_image, video_id: 'yt' })
  })

  it('flags a missing game, a backwards row, overlap and running past the VOD', () => {
    const [a, b, c, d] = gameDrafts([
      { ...row, start_time: 0, end_time: 100 },
      { ...row, start_time: 50, end_time: 150 },
      { ...row, start_time: 200, end_time: 190 },
      { ...row, start_time: 300, end_time: 5000, game_name: '' },
    ])
    const errors = gameErrors([a!, b!, c!, d!], 3600)
    expect(errors.has(a!.key)).toBe(false)
    expect(errors.get(b!.key)).toMatch(/Overlaps/)
    expect(errors.get(c!.key)).toMatch(/after the start/)
    expect(errors.get(d!.key)).toBe('Pick a game.')
    const [e] = gameDrafts([{ ...row, start_time: 0, end_time: 5000 }])
    expect(gameErrors([e!], 3600).get(e!.key)).toMatch(/Ends after/)
  })

  it('copy from chapters leaves out cut chapters', () => {
    const rows = gamesFromChapters([raw({ name: 'A', start: 0, end: 100 }), raw({ name: 'B', start: 100, end: 50, restricted: true })])
    expect(rows.map((r) => [r.name, r.start, r.end])).toEqual([['A', 0, 100]])
  })
})

describe('settings drafts', () => {
  const setting = (over: Partial<RuntimeSetting>): RuntimeSetting => ({
    key: 'k', value: '', default: '', overridden: false, type: 'text', group: 'Runner', applies: 'now', help: '',
    min: null, max: null, updated_at: null, updated_by: null, ...over,
  })

  it('checks numbers against the range, and whole numbers for ints', () => {
    const s = setting({ type: 'int', value: 2, min: 1, max: 8 })
    expect(fromDraft(s, '0')).toEqual({ error: 'At least 1.' })
    expect(fromDraft(s, '9')).toEqual({ error: 'At most 8.' })
    expect(fromDraft(s, '1.5')).toEqual({ error: 'A whole number.' })
    expect(fromDraft(s, '')).toEqual({ error: 'A number.' })
    expect(fromDraft(s, ' 4 ')).toEqual({ value: 4 })
  })

  it('trims lists and drops repeats, and keeps steps in the job order', () => {
    expect(fromDraft(setting({ type: 'list' }), ['a', '', ' b ', 'a'])).toEqual({ value: ['a', 'b'] })
    const steps = setting({ type: 'steps', choices: { vod: ['download', 'upload', 'cleanup'] } })
    expect(fromDraft(steps, { vod: ['cleanup', 'download'], live: [] })).toEqual({ value: { vod: ['download', 'cleanup'] } })
  })

  it('sends only changed settings, and none with errors', () => {
    const items = [
      setting({ key: 'on', type: 'bool', value: true }),
      setting({ key: 'n', type: 'int', value: 2, min: 1 }),
      setting({ key: 'l', type: 'list', value: ['x'] }),
    ]
    const drafts = Object.fromEntries(items.map((s) => [s.key, toDraft(s)]))
    expect(settingChanges(items, drafts)).toEqual({ changes: {}, errors: new Map() })
    drafts.on = false
    drafts.n = '0'
    drafts.l = ['x', 'y']
    const r = settingChanges(items, drafts)
    expect(r.changes).toEqual({ on: false, l: ['x', 'y'] })
    expect([...r.errors.keys()]).toEqual(['n'])
    expect(showValue(items[0]!, false)).toBe('off')
    expect(showValue(items[2]!, [])).toBe('none')
  })
})
