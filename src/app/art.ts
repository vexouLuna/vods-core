// The site's own art for the app's stand-ins: what shows where a VOD has no thumbnail, the Twitch mark on the Manage
// button and "Sign in with Twitch", and the timeline's playhead. createVodsApp() sets these from its `art` option;
// unset, the app draws its defaults (components/NoThumbnail.vue, TwitchMark.vue, SnailMarker.vue).
import { markRaw, type Component } from 'vue'

export interface VodsArt {
  /** Fills a 16:9 box where a VOD has no thumbnail, and reads as such to screen readers (e.g. `role="img"`). */
  noThumbnail?: Component
  /** The Twitch mark, 16 px, in the button's text color. */
  twitchGlyph?: Component
  /**
   * The timeline's playhead, in place of the snail (components/SnailMarker.vue), with its props: `mode` (walk while
   * playing, sleep while paused, float while seeking), `rate` (the playback speed) and `shell` (the game's colour).
   */
  playhead?: Component
}

export const art: VodsArt = {}

/** Sets the site's art; anything left out goes back to the default. createVodsApp() calls it; tests can too. */
export function configureArt(a: VodsArt = {}): void {
  art.noThumbnail = a.noThumbnail && markRaw(a.noThumbnail)
  art.twitchGlyph = a.twitchGlyph && markRaw(a.twitchGlyph)
  art.playhead = a.playhead && markRaw(a.playhead)
}
