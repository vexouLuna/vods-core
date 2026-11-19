import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { censorEdits, type CensorDraft } from '../../src/app/admin/edits'
import { aloneCover, blurRadius, boxPx, pixelBlock, soundAt, textSize } from '../../src/app/admin/preview/censorRender'
import { readFont } from '../../src/app/admin/preview/fontMetrics'

// The font the preview ships, the same file as the worker's CENSOR_FONT (twitch-archive's tests/fixtures/fonts).
const bytes = readFileSync(new URL('../../src/app/admin/preview/fonts/DejaVuSans-Bold.ttf', import.meta.url))
const font = readFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

let k = 0
const row = (p: Partial<CensorDraft>): CensorDraft => ({
  key: ++k, start: 0, end: 10, video: 'none', color: '#000000', region: null, text: '', sound: 'none', song: '', volume: 100, note: '', ...p,
})

describe("the preview's boxes are the worker's", () => {
  // twitch-archive's ffmpeg._box, and ffmpeg.text_size with the same font (test_text_size_measures_the_text_in_the_font).
  it.each([
    [{ x: 0, y: 0.0471, w: 0.8116, h: 0.8588 }, 1920, 1080, 'outdoor boys DMCA', { x: 0, y: 50, w: 1558, h: 928 }, 124, 10],
    [{ x: 0.7913, y: 0.0489, w: 0.2087, h: 0.6871 }, 1920, 1080, 'a', { x: 1520, y: 52, w: 400, h: 742 }, 371, 30],
    [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 1921, 1081, 'Spoilers', { x: 192, y: 108, w: 384, h: 216 }, 72, 6],
    [{ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, 160, 90, 'x'.repeat(60), { x: 144, y: 80, w: 16, h: 10 }, 10, 1],
    [{ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 200, 100, '  Hi ', { x: 100, y: 50, w: 100, h: 50 }, 25, 2],
    [null, 1280, 720, 'Full', { x: 0, y: 0, w: 1280, h: 720 }, 360, 30],
    [{ x: 0, y: 0, w: 0.5, h: 0.2 }, 1920, 1080, 'WWW MMM ÄÖÜ \u{1f3b5}', { x: 0, y: 0, w: 960, h: 216 }, 81, 6],
  ])('%j in %ix%i with %j', (region, w, h, text, box, size, border) => {
    expect(boxPx(region, w, h)).toEqual(box)
    expect(textSize(box, text, font)).toEqual({ size, border })
  })

  it('measures as the worker does: advance widths, a missing character as glyph 0', () => {
    expect([font.units, font.advance('outdoor boys DMCA'), font.advance('a')]).toEqual([2048, 22813, 1382])
  })

  it('blurs and pixelates with the worker radius and block', () => {
    expect(blurRadius({ x: 192, y: 108, w: 384, h: 216 }, false)).toBe(27) // test_cover_filter_graphs: luma_radius=27
    expect(blurRadius({ x: 0, y: 0, w: 1920, h: 1080 }, true)).toBe(54) // COVER_FILTERS: min(w,h)/20
    expect(pixelBlock({ x: 144, y: 80, w: 16, h: 10 })).toBe(4)
    expect(aloneCover([row({ video: 'blur' })])).toBe(true)
    expect(aloneCover([row({ video: 'blur', text: 'x' })])).toBe(false)
    expect(aloneCover([row({ video: 'blur' }), row({ video: 'black' })])).toBe(false)
  })
})

describe('ranges apply in list order', () => {
  it('saves them in the list order, unsorted', () => {
    const rows = [row({ start: 5, end: 9, sound: 'mute' }), row({ start: 0, end: 10, sound: 'mute' })]
    expect(censorEdits(rows).map((r) => r.start)).toEqual([5, 0])
  })

  it('plays the song of job 1068 (a mute, then a song over the same stretch)', () => {
    const rows = [
      row({ start: 864.5, end: 3022.543, video: 'blur', region: { x: 0, y: 0.0471, w: 0.8116, h: 0.8588 }, text: 'outdoor boys DMCA', sound: 'mute' }),
      row({ start: 864.5, end: 3022.543, video: 'blur', region: { x: 0.7913, y: 0.0489, w: 0.2087, h: 0.6871 } }),
      row({ start: 864.5, end: 3022.543, sound: 'song', song: 'song-519bf838604b', volume: 25 }),
    ]
    expect(soundAt(rows, 1000)).toEqual({ base: 'song', song: { id: 'song-519bf838604b', volume: 0.25, start: 864.5 }, muffles: 0 })
    expect(soundAt(rows, 100)).toEqual({ base: 'stream', muffles: 0 })
    // The song moved first: the mute after it silences it (twitch-archive's test_job_1068_in_another_order...).
    expect(soundAt([rows[2]!, rows[1]!, rows[0]!], 1000)).toEqual({ base: 'silence', muffles: 0 })
  })

  it('silences a song after it, muffles a song before it, and stacks muffles', () => {
    const song = row({ sound: 'song', song: 's', volume: 50 })
    expect(soundAt([song, row({ sound: 'mute' })], 5).base).toBe('silence')
    expect(soundAt([song, row({ sound: 'muffle' })], 5)).toMatchObject({ base: 'song', muffles: 1 })
    expect(soundAt([row({ sound: 'muffle' }), song], 5)).toMatchObject({ base: 'song', muffles: 0 })
    expect(soundAt([row({ sound: 'muffle' }), row({ sound: 'muffle', start: 2 })], 5)).toEqual({ base: 'stream', muffles: 2 })
    expect(soundAt([song], 10).base).toBe('stream') // the end is out
  })
})
