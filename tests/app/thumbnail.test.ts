import { describe, expect, it } from 'vitest'
import type { ThumbnailTemplate } from '../../src/app/admin/api'
import { lineErrors, newLine, templateError, THUMBNAIL_MAX_LINES } from '../../src/app/admin/thumbnail'

const FIELDS = ['part', 'total', 'games', 'label', 'title', 'date', 'channel']
const line = (text: string, more = {}) => ({ ...newLine([]), text, ...more })

describe('the thumbnail template, as the worker checks it', () => {
  it('names what is wrong with each line', () => {
    const t: ThumbnailTemplate = {
      at: 0.25,
      lines: [
        line('PART {part}/{total}'),
        line('  '),
        line('{secret}'),
        line('{part.__class__}'),
        line('a { b'),
        line('ok', { color: 'red' }),
        line('ok', { box: null }),
      ],
    }
    expect(lineErrors(t, FIELDS)).toEqual([
      null,
      'Write some text, or remove the line.',
      expect.stringContaining('There is no {secret}'),
      'Braces are only for fields, like {part}.',
      'Braces are only for fields, like {part}.',
      'Colours are #rrggbb.',
      null,
    ])
    expect(templateError(t, FIELDS)).toBe('Fix the lines marked below first.')
    expect(templateError({ at: 0, lines: [line('{title}')] }, FIELDS)).toBeNull()
  })

  it('caps the lines, and puts a new one under the others', () => {
    const many = Array.from({ length: THUMBNAIL_MAX_LINES + 1 }, () => line('x'))
    expect(templateError({ at: 0, lines: many }, FIELDS)).toContain('At most')
    expect(newLine([]).y).toBeLessThan(newLine([line('a'), line('b')]).y)
    expect(newLine(many).y).toBeLessThanOrEqual(0.85)
  })
})
