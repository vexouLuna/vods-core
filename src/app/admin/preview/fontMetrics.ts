// How wide a line of text is in a TrueType font, read from the font's own tables (cmap format 12 and hmtx): what the
// archive worker reads to size censor text (twitch-archive's font.py, the same steps), so the preview sizes it the
// same. The font is the worker's CENSOR_FONT, DejaVu Sans Bold, shipped unmodified in ./fonts with its LICENSE.

export interface FontMetrics {
  /** Units per em. */
  units: number
  /** The advance widths of `text`'s characters added up, in font units; a missing character is glyph 0's box. */
  advance(text: string): number
}

export function readFont(buf: ArrayBuffer): FontMetrics {
  const d = new DataView(buf)
  const tables = new Map<string, number>()
  for (let i = 0; i < d.getUint16(4); i++) {
    const at = 12 + 16 * i
    tables.set(String.fromCharCode(d.getUint8(at), d.getUint8(at + 1), d.getUint8(at + 2), d.getUint8(at + 3)), d.getUint32(at + 8))
  }
  const table = (tag: string) => {
    const at = tables.get(tag)
    if (at == null) throw new Error(`the font has no ${tag} table`)
    return at
  }
  const units = d.getUint16(table('head') + 18)
  const hmtx = table('hmtx')
  const advances = Array.from({ length: d.getUint16(table('hhea') + 34) }, (_, i) => d.getUint16(hmtx + 4 * i))
  const cmap = table('cmap')
  for (let i = 0; i < d.getUint16(cmap + 2); i++) {
    const [platform, encoding, offset] = [d.getUint16(cmap + 4 + 8 * i), d.getUint16(cmap + 6 + 8 * i), d.getUint32(cmap + 8 + 8 * i)]
    const at = cmap + offset
    if (!((platform === 3 && encoding === 10) || (platform === 0 && encoding === 4)) || d.getUint16(at) !== 12) continue
    const groups = Array.from({ length: d.getUint32(at + 12) }, (_, j) => [d.getUint32(at + 16 + 12 * j), d.getUint32(at + 20 + 12 * j), d.getUint32(at + 24 + 12 * j)] as const)
    const glyph = (c: number) => {
      for (const [first, last, g] of groups) if (c >= first && c <= last) return g + c - first
      return 0
    }
    return {
      units,
      advance: (text) => {
        let sum = 0
        for (const ch of text) sum += advances[Math.min(glyph(ch.codePointAt(0)!), advances.length - 1)]!
        return sum
      },
    }
  }
  throw new Error('the font has no Unicode cmap (format 12)')
}

/** The family name the preview draws censor text in, once censorFont() has loaded it. */
export const CENSOR_FAMILY = 'Vods Censor Text'

let loading: Promise<FontMetrics> | null = null
/** The worker's font, loaded once (its own chunk, so only Manage → VOD's preview fetches it): its metrics, and the
 * font added to the page as CENSOR_FAMILY. */
export function censorFont(): Promise<FontMetrics> {
  loading ??= import('./fonts/DejaVuSans-Bold.ttf?url').then(async ({ default: url }) => {
    const buf = await (await fetch(url)).arrayBuffer()
    const face = new FontFace(CENSOR_FAMILY, buf, { weight: '700' })
    document.fonts.add(await face.load())
    return readFont(buf)
  })
  loading.catch(() => (loading = null)) // try again next time
  return loading
}
