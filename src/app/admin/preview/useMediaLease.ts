// The one lease to stream the server's VOD files (twitch-archive's /api/v2/media/lease): one browser tab on the whole
// server at a time. This tab claims it when it wants a server file, renews it every 10 s, and lets go when it leaves
// (unmount, or `pagehide` with a keepalive request). Another tab can take it over; this one then stops and shows who.
import { errorText, ProblemError } from '@vex/platform-web'
import { onScopeDispose, ref } from 'vue'
import type { MediaHolder, MediaName } from '../api'
import { admin } from '../session'

export type LeaseState = 'idle' | 'claiming' | 'held' | 'in_use' | 'lost' | 'error'

export const HEARTBEAT_MS = 10_000

/** This tab's id for the lease, the same across VOD pages until the tab is closed or reloaded. */
export const TAB_LEASE = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')

const holderOf = (e: unknown): MediaHolder | null =>
  e instanceof ProblemError ? ((e.extra.holder ?? e.body.holder ?? null) as MediaHolder | null) : null

export function useMediaLease(vodId: () => string) {
  const state = ref<LeaseState>('idle')
  /** The other tab's holder (in_use, lost), or this tab's own (held). */
  const holder = ref<MediaHolder | null>(null)
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setInterval> | undefined

  function stopBeat() {
    clearInterval(timer)
    timer = undefined
  }

  async function beat() {
    try {
      await admin.renewMedia(TAB_LEASE)
    } catch (e) {
      if (e instanceof ProblemError && e.status === 410) {
        stopBeat()
        holder.value = holderOf(e)
        state.value = 'lost'
      }
      // Anything else (a blip): the next beat tries again; 30 s without one and the lease goes stale.
    }
  }

  /** Take the lease (`takeOver`: even from another tab). Resolves to whether this tab holds it now. */
  async function claim(file: MediaName | null, takeOver = false): Promise<boolean> {
    state.value = 'claiming'
    error.value = null
    try {
      holder.value = await admin.claimMedia({ lease_id: TAB_LEASE, vod_id: vodId(), file, take_over: takeOver })
      state.value = 'held'
      stopBeat()
      timer = setInterval(beat, HEARTBEAT_MS)
      return true
    } catch (e) {
      if (e instanceof ProblemError && e.status === 409) {
        holder.value = holderOf(e)
        state.value = 'in_use'
      } else {
        error.value = errorText(e)
        state.value = 'error'
      }
      return false
    }
  }

  async function release(keepalive = false) {
    const held = state.value === 'held'
    stopBeat()
    state.value = 'idle'
    if (held) await admin.releaseMedia(TAB_LEASE, keepalive).catch(() => undefined)
  }

  const onHide = () => void release(true)
  window.addEventListener('pagehide', onHide)
  onScopeDispose(() => {
    window.removeEventListener('pagehide', onHide)
    void release(true)
  })

  return { state, holder, error, claim, release, lease: TAB_LEASE }
}
