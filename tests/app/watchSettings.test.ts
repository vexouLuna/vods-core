import { describe, expect, it } from 'vitest'
import { readWatchSettings } from '../../src/app/composables/useWatchSettings'

describe('readWatchSettings', () => {
  it("turns YouTube's controls on when nothing is saved", () => {
    expect(readWatchSettings(() => null)).toEqual({ youtubeControls: true })
    expect(readWatchSettings(() => 'not json')).toEqual({ youtubeControls: true })
  })

  it('keeps what a viewer saved', () => {
    expect(readWatchSettings(() => '{"youtubeControls":false}')).toEqual({ youtubeControls: false })
  })
})
