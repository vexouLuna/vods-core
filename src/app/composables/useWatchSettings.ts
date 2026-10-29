// The viewer's player settings, remembered in this browser like the chat's (useChatSettings). Volume isn't kept here:
// YouTube's player remembers it itself.
import { reactive, watch } from 'vue'

export interface WatchSettings {
  /** YouTube's own controls over the video. Off by default: the page's timeline and controls replace them. */
  youtubeControls: boolean
}

const KEY = 'vods.watch.v1'

export const defaultWatchSettings = (): WatchSettings => ({ youtubeControls: false })

/** The saved settings (from `get`, e.g. localStorage's), with anything missing or odd set to the default. */
export function readWatchSettings(get: (key: string) => string | null): WatchSettings {
  const base = defaultWatchSettings()
  try {
    const saved = JSON.parse(get(KEY) ?? '{}') as Partial<WatchSettings>
    return { youtubeControls: typeof saved.youtubeControls === 'boolean' ? saved.youtubeControls : base.youtubeControls }
  } catch {
    return base
  }
}

let shared: WatchSettings | null = null

export function useWatchSettings(): WatchSettings {
  if (shared) return shared
  let saved = defaultWatchSettings()
  try {
    saved = readWatchSettings((key) => localStorage.getItem(key))
  } catch {
    // storage blocked: the defaults
  }
  const s = reactive(saved)
  watch(
    s,
    () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s))
      } catch {
        // not saved; still works for this visit
      }
    },
    { deep: true },
  )
  shared = s
  return s
}
