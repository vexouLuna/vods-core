import { describe, expect, it } from 'vitest'
import { moved } from '../../src/app/lib/reorder'

describe('moved', () => {
  it('swaps an item with its neighbour, as a copy', () => {
    const list = ['a', 'b', 'c']
    expect(moved(list, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moved(list, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('leaves the order alone past either end', () => {
    expect(moved(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moved(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moved(['a'], 3, -1)).toEqual(['a'])
  })
})
