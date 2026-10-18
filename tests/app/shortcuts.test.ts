// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { typing } from '../../src/app/composables/useShortcuts'

function keyOn(html: string, key: string): boolean {
  document.body.innerHTML = html
  const target = document.body.querySelector('#t')!
  const e = new KeyboardEvent('keydown', { key })
  Object.defineProperty(e, 'target', { value: target })
  return typing(e)
}

describe('which keys the focused control keeps', () => {
  it('lets Space through on the timeline (a slider), so it plays and pauses', () => {
    expect(keyOn('<div id="t" role="slider" tabindex="0"></div>', ' ')).toBe(false)
  })
  it('keeps Space and Enter on buttons, links and switches, and every key in inputs', () => {
    expect(keyOn('<button id="t"></button>', ' ')).toBe(true)
    expect(keyOn('<a id="t" href="#"></a>', 'Enter')).toBe(true)
    expect(keyOn('<div id="t" role="switch"></div>', ' ')).toBe(true)
    expect(keyOn('<input id="t">', 'k')).toBe(true)
    expect(keyOn('<div id="t"></div>', 'k')).toBe(false)
  })
})
