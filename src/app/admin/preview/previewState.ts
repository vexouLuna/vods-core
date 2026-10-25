// What Manage → VOD's preview shares with the editors under it (provide/inject): the playhead, a way to seek, and the
// censor drafts it draws boxes for. The editors work the same without a preview (inject gives null).
import { inject, provide, ref, shallowRef, type InjectionKey, type Ref, type ShallowRef } from 'vue'
import type { CensorDraft } from '../edits'

export interface PreviewState {
  /** The playhead, in VOD seconds. */
  time: Ref<number>
  /** A source is loaded, so the playhead means something and seek() goes somewhere. */
  ready: Ref<boolean>
  /** Set by the preview while a source is loaded. */
  seeker: ShallowRef<((t: number) => void) | null>
  /** The censor editor's draft rows (the same objects: a box drawn on the video edits the draft). */
  censor: ShallowRef<CensorDraft[] | null>
  /** The censor row being edited over the video (its key). */
  selected: Ref<number | null>
}

const KEY: InjectionKey<PreviewState> = Symbol('vods-preview')

export function providePreview(): PreviewState {
  const state: PreviewState = { time: ref(0), ready: ref(false), seeker: shallowRef(null), censor: shallowRef(null), selected: ref(null) }
  provide(KEY, state)
  return state
}

export const usePreview = (): PreviewState | null => inject(KEY, null)

/** Jump the preview to `t` (no-op without a loaded source). */
export function seekTo(state: PreviewState, t: number): void {
  state.time.value = t
  state.seeker.value?.(t)
}
