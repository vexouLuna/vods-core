import { describe, expect, it } from 'vitest'
import { readWatchSettings } from '../../src/app/composables/useWatchSettings'

describe('readWatchSettings', () => {
  it("turns YouTube's controls on and captions off when nothing is saved", () => {
    expect(readWatchSettings(() => null)).toEqual({ youtubeControls: true, captions: false })
    expect(readWatchSettings(() => 'not json')).toEqual({ youtubeControls: true, captions: false })
  })

  it('keeps what a viewer saved', () => {
    expect(readWatchSettings(() => '{"youtubeControls":false}')).toEqual({ youtubeControls: false, captions: false })
    expect(readWatchSettings(() => '{"captions":true}')).toEqual({ youtubeControls: true, captions: true })
    expect(readWatchSettings(() => '{"captions":"yes"}')).toEqual({ youtubeControls: true, captions: false })
  })
})
