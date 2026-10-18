import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// deep-field.css copies vex-ui's rules as vods-* (CSS can't reuse a rule under another name). Each copy must still
// match the installed @vex/ui's built style.css, so a vex-ui bump that changes one fails here until it's re-copied.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8')

/** `rgb(0 0 0/.55)` as the build writes it, `#0000008c`. */
const hex = (_: string, ...c: string[]) =>
  '#' + [...c.slice(0, 3).map(Number), Math.round(Number(c[3]) * 255)].map((n) => n.toString(16).padStart(2, '0')).join('')

/** selector → its declarations, normalized so the minified build and the source compare equal. */
function rules(css: string): Map<string, string[]> {
  const flat = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const out = new Map<string, string[]>()
  for (const [, sel, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const key = (sel ?? '').replace(/\s+/g, '').replace(/::/g, ':')
    const decls = (body ?? '')
      .split(';')
      .map((d) => d.trim().replace(/\s*([,:()/>])\s*/g, '$1').replace(/\s+/g, ' ').replace(/'/g, '"').replace(/(^|[^\d.])0\./g, '$1.').replace(/rgb\((\d+) (\d+) (\d+)\/([\d.]+)\)/g, hex))
      // the build adds -webkit- twins; the unprefixed declarations are what's compared
      .filter((d) => d && !d.startsWith('-webkit-'))
    out.set(key, [...(out.get(key) ?? []), ...decls])
  }
  return out
}

describe('the Deep Field theme', () => {
  const vx = rules(read('node_modules/@vex/ui/dist/style.css'))
  const vods = [...rules(read('src/app/deep-field/deep-field.css'))].filter(([sel]) => sel.includes('.vods-'))

  it('copies vex-ui rules', () => {
    expect(vods.map(([sel]) => sel)).toEqual(expect.arrayContaining(['.vods-panel', '.vods-panel:after', '.vods-btn', '.vods-display']))
  })

  it.each(vods.map(([sel, decls]) => [sel, decls] as const))('%s matches vex-ui', (sel, decls) => {
    expect(decls).toEqual(vx.get(sel.replaceAll('vods-', 'vx-')))
  })
})
