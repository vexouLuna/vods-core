import { describe, expect, it } from 'vitest'
import { useLatest } from '../../src/app/lib/latest'
import { tenthsOf } from '../../src/app/lib/time'

describe('useLatest', () => {
  it('only the newest begin() stays current', () => {
    const begin = useLatest()
    const a = begin()
    expect(a()).toBe(true)
    const b = begin()
    expect(a()).toBe(false)
    expect(b()).toBe(true)
  })
})

describe('tenthsOf', () => {
  it('reads exact tenths despite float error', () => {
    expect(tenthsOf(2.3)).toBe(3)
    expect(tenthsOf(10.9)).toBe(9)
    expect(tenthsOf(5)).toBe(0)
  })
})
