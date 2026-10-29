import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent } from 'vue'
import WatchIcon from '../../src/app/components/WatchIcon.vue'
import { installUi, type VodsUi } from '../../src/app/ui'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/app')
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? (f === 'deep-field' ? [] : files(join(d, f))) : [join(d, f)]))

describe('the app is look-neutral', () => {
  it('imports no vex-ui component or style outside deep-field/', () => {
    const bad = files(APP).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^\n]*from '@vex\/ui(\/[^'/]+\.css)?'/gm)].map((m) => `${f}: ${m[0]}`),
    )
    expect(bad).toEqual([])
  })

  it('uses only Ui* controls and vods-* hooks', () => {
    const bad = files(APP).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<\/?Vx[A-Z]\w*|\.vx-[a-z]|"vx-[a-z]|var\(--vx-/g)].map((m) => `${f}: ${m[0]}`))
    expect(bad).toEqual([])
  })

  it('registers a site’s controls as Ui*, and names any it left out', () => {
    const c = defineComponent({ render: () => null })
    const ui = { components: { Button: c } } as unknown as VodsUi
    expect(() => installUi(createApp({}), ui, '')).toThrow(/missing AccountMenu, Callout/)

    const full = { components: new Proxy({}, { get: () => c }), install: (_a: unknown, ctx: { commit: string }) => (seen = ctx.commit) } as unknown as VodsUi
    let seen = ''
    const app = createApp({})
    installUi(app, full, 'abc123')
    expect(app.component('UiShell')).toBe(c)
    expect(seen).toBe('abc123')
    expect(app.component('UiIcon')).toBe(c)
  })

  it('draws its own icons for a site that brings no Icon', () => {
    const c = defineComponent({ render: () => null })
    const noIcon = { components: new Proxy({}, { get: (_t, k) => (k === 'Icon' ? undefined : c) }) } as unknown as VodsUi
    const app = createApp({})
    installUi(app, noIcon, '')
    expect(app.component('UiIcon')).toBe(WatchIcon)
  })
})
