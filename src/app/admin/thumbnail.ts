// The thumbnail template's rules as the worker checks them (twitch-archive's thumbnails.py, docs/admin-api.md
// "Thumbnails"), so the editor says what is wrong before saving. The worker checks again; its 422 wins.
import type { ThumbnailLine, ThumbnailTemplate } from './api'

export const THUMBNAIL_MAX_LINES = 8
export const THUMBNAIL_TEXT_MAX = 120
export const THUMBNAIL_SIZE = { min: 0.02, max: 0.3 }
const FIELD = /\{(\w+)\}/g
const COLOR = /^#[0-9a-f]{6}$/i

/** A new line, under the others: white on black, centred. */
export function newLine(lines: ThumbnailLine[]): ThumbnailLine {
  const y = Math.min(0.85, 0.1 + 0.12 * lines.length)
  return { text: '{title}', x: 0.5, y: Math.round(y * 100) / 100, align: 'center', size: 0.07, color: '#ffffff', box: '#000000' }
}

/** What is wrong with each line (null: nothing), with `fields` the ones the worker named. */
export function lineErrors(template: ThumbnailTemplate, fields: string[]): (string | null)[] {
  return template.lines.map((l) => {
    const text = l.text.trim()
    if (!text) return 'Write some text, or remove the line.'
    if (l.text.length > THUMBNAIL_TEXT_MAX) return `At most ${THUMBNAIL_TEXT_MAX} characters.`
    const unknown = [...l.text.matchAll(FIELD)].map((m) => m[1] ?? '').find((f) => !fields.includes(f))
    if (unknown) return `There is no {${unknown}}; fields: ${fields.map((f) => `{${f}}`).join(' ')}.`
    if (/[{}]/.test(l.text.replace(FIELD, ''))) return 'Braces are only for fields, like {part}.'
    if (!COLOR.test(l.color) || (l.box !== null && !COLOR.test(l.box))) return 'Colours are #rrggbb.'
    return null
  })
}

/** Template-wide problems (null: it can be saved). */
export function templateError(template: ThumbnailTemplate, fields: string[]): string | null {
  if (template.lines.length > THUMBNAIL_MAX_LINES) return `At most ${THUMBNAIL_MAX_LINES} lines.`
  return lineErrors(template, fields).some(Boolean) ? 'Fix the lines marked below first.' : null
}
