import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/app/components', f), 'utf8')

describe('Manage lives only in the account menu', () => {
  it('has no Manage button in the header', () => {
    expect(read('VodsShell.vue')).not.toMatch(/#actions|\/manage/)
  })

  it('shows Manage whenever the dashboard session is live, with a menu user for a password-only admin', () => {
    const menu = read('AccountMenu.vue')
    expect(menu).toMatch(/<UiMenuItem v-if="session\.authenticated" to="\/manage"/)
    expect(menu).toMatch(/session\.authenticated \? \{ name: session\.user\?\.displayName \?\? 'admin' \}/)
  })
})
