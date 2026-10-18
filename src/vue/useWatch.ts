import { computed, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { pickSyntheticUploadType, SegmentTimeline, sourceIds } from '../composite'
import { pickUploadType, Timeline, type PlayableTimeline } from '../timeline'
import type { UploadType, Vod } from '../types'
import { useVodsContext } from './context'

/**
 * Loads a VOD and builds its timeline for the chosen upload set (`/vods/:id`, `/youtube/:id`, `/live/:id`). For a
 * synthetic VOD it also loads the VODs it's made of (`sources`), and the timeline plays their windows, unless `play` is
 * "compiled" and it has compiled uploads (the whole VOD as one file): then those play like a VOD's own.
 */
export function useWatch(
  vodId: MaybeRefOrGetter<string>,
  type?: MaybeRefOrGetter<UploadType | null | undefined>,
  play?: MaybeRefOrGetter<'segments' | 'compiled' | null | undefined>,
) {
  const { client, config } = useVodsContext()
  const vod = shallowRef<Vod | null>(null)
  /** A synthetic VOD's sources that loaded (a hidden one doesn't: its segments are skipped). Empty otherwise. */
  const sources = shallowRef<Vod[]>([])
  const loading = ref(true)
  const notFound = ref(false)
  const error = shallowRef<Error | null>(null)
  let ctrl: AbortController | undefined

  async function load(id: string) {
    ctrl?.abort()
    const mine = (ctrl = new AbortController())
    loading.value = true
    notFound.value = false
    error.value = null
    vod.value = null
    sources.value = []
    try {
      const v = await client.getVod(id, mine.signal)
      const found = v ? await Promise.all(sourceIds(v).map((s) => client.getVod(s, mine.signal))) : []
      if (mine.signal.aborted) return
      sources.value = found.filter((s): s is Vod => s !== null)
      vod.value = v
      notFound.value = v === null
    } catch (e) {
      if (!mine.signal.aborted) error.value = e as Error
    } finally {
      if (!mine.signal.aborted) loading.value = false
    }
  }

  watch(() => toValue(vodId), load, { immediate: true })
  onScopeDispose(() => ctrl?.abort())

  /** A synthetic VOD's compiled uploads exist; the watch page then offers both versions. */
  const hasCompiled = computed(() => !!vod.value?.synthetic && vod.value.uploads.some((u) => u.type === 'compiled'))
  const compiled = computed(() => hasCompiled.value && toValue(play) === 'compiled')
  const opts = { defaultPartDuration: config.defaultPartDuration }
  /** Set on a synthetic VOD (for chat and the segment marks), also while its compiled file plays: both run on its time. */
  const segments = computed(() => {
    const v = vod.value
    return v?.synthetic ? new SegmentTimeline(v, sources.value, pickSyntheticUploadType(sources.value, toValue(type)), opts) : null
  })
  const timeline = computed<PlayableTimeline | null>(() => {
    const v = vod.value
    if (!v) return null
    if (compiled.value) return new Timeline(v, 'compiled', opts)
    return segments.value ?? new Timeline(v, pickUploadType(v, toValue(type)), opts)
  })
  const uploadType = computed<UploadType | null>(() => timeline.value?.type ?? null)
  /** Drive download for the same upload set, if there is one. */
  const download = computed(() => vod.value?.drive.find((d) => d.type === uploadType.value) ?? null)

  return { vod, sources, timeline, segments, uploadType, hasCompiled, download, loading, notFound, error, reload: () => load(toValue(vodId)) }
}
