// Manage's merge and split for one VOD, without its look. Both make synthetic VODs tagged `vods` and hide the VODs
// they're made of (ADR 0005 in twitch-archive); deleting the synthetic VOD undoes it. Merge: this VOD and any others
// (suggested: those starting less than 24 h after it ends or ending less than 24 h before it starts; or by id), in
// start order, with a gap before each, as `<first id>-m` or an id of your own. Split: before and after any second, as
// `<id>-1` and `<id>-2` or ids of your own. SplicePanel.vue draws it; a site with its own UI binds the same refs.
import { computed, ref, watch } from 'vue'
import { duration as formatDuration, errorText } from '@vex/platform-web'
import { normalizeVod, Timeline, toClock, toSeconds } from '../../index'
import type { AdminVod, MergeCandidate, SyntheticVod } from '../admin/api'
import { admin } from '../admin/session'
import type { Notify } from '../lib/notify'

/** "4m 12s", "1h 02m", "40s", for a gap either way. */
export const gapText = (seconds: number) => formatDuration(Math.abs(seconds))

/** Where one part ends and the next starts: handy places to split. */
export function splitJoins(timeline: Pick<Timeline, 'partSpans'> | null): { at: number; label: string }[] {
  const spans = timeline?.partSpans() ?? []
  return spans.slice(0, -1).map((s, i) => ({ at: Math.round(s.end), label: `after P${i + 1}` }))
}

/** Whether a gap typed for a merge isn't one: not empty, and not 0 or more seconds (or H:MM:SS). */
export function badGap(draft: string): boolean {
  const s = toSeconds(draft)
  return draft.trim() !== '' && !(Number.isFinite(s) && s >= 0)
}

/** A VOD in a merge: what ordering it and working out the gaps need. */
export interface MergeVod {
  id: string
  title: string | null
  createdAt: string
  /** Seconds. */
  duration: number
}

/** One join of a merge, in start order: the gap from `before`'s end to `after`'s start, by their times. */
export interface MergeJoin {
  key: string
  before: MergeVod
  after: MergeVod
  gap: number
}

const startOf = (v: MergeVod) => Date.parse(v.createdAt)

/** The VODs in start order (ties by id), and each join between them. */
export function mergeOrder(vods: MergeVod[]): { order: MergeVod[]; joins: MergeJoin[] } {
  const order = [...vods].sort((a, b) => startOf(a) - startOf(b) || a.id.localeCompare(b.id))
  const joins = order.slice(1).map((after, i) => {
    const before = order[i]!
    return { key: `${before.id}>${after.id}`, before, after, gap: Math.round((startOf(after) - startOf(before)) / 1000 - before.duration) }
  })
  return { order, joins }
}

export interface SpliceOptions {
  /** A synthetic VOD was made (open it). */
  made: (id: string) => void
  notify: Notify
}

const asMergeVod = (v: AdminVod | MergeCandidate): MergeVod =>
  'created_at' in v
    ? { id: v.id, title: v.title, createdAt: v.created_at, duration: toSeconds(v.duration ?? '') || 0 }
    : { id: v.id, title: v.title ?? null, createdAt: v.createdAt, duration: v.duration_seconds ?? (toSeconds(v.duration ?? '') || 0) }

/** The merge and split panel's logic for `props.vod`. */
export function useSplice(props: { vod: AdminVod }, options: SpliceOptions) {
  const { notify } = options
  const busy = ref<'merge' | 'split' | 'add' | null>(null)

  // ---- merge ----
  const cands = ref<MergeCandidate[] | null>(null)
  const candsError = ref<string | null>(null)
  async function loadCandidates() {
    candsError.value = null
    try {
      cands.value = (await admin.mergeCandidates(props.vod.id, 24)).items
    } catch (e) {
      candsError.value = errorText(e)
    }
  }

  /** The VODs merged with this one. */
  const picked = ref<MergeVod[]>([])
  const self = computed(() => asMergeVod(props.vod))
  const has = (id: string) => id === props.vod.id || picked.value.some((v) => v.id === id)
  const suggestions = computed(() => (cands.value ?? []).filter((c) => !has(c.id)))
  function pick(c: MergeCandidate) {
    if (!has(c.id)) picked.value = [...picked.value, asMergeVod(c)]
  }
  const unpick = (id: string) => (picked.value = picked.value.filter((v) => v.id !== id))

  const addDraft = ref('')
  const addError = ref<string | null>(null)
  watch(addDraft, () => (addError.value = null))
  async function addById() {
    const id = addDraft.value.trim()
    if (!id) return
    if (has(id)) {
      addError.value = id === props.vod.id ? "That's this VOD." : 'Already in the merge.'
      return
    }
    busy.value = 'add'
    try {
      const v = await admin.vod(id)
      if (!has(v.id)) picked.value = [...picked.value, asMergeVod(v)]
      addDraft.value = ''
    } catch (e) {
      addError.value = (e as { status?: number }).status === 404 ? `No VOD ${id}.` : errorText(e)
    } finally {
      busy.value = null
    }
  }

  const merge_ = computed(() => mergeOrder([self.value, ...picked.value]))
  const order = computed(() => merge_.value.order)
  const joins = computed(() => merge_.value.joins)
  /** One gap per join, typed or filled from the start times (empty: where it started, as when they overlap). */
  const gapDrafts = ref<Record<string, string>>({})
  watch(
    joins,
    (list) => {
      const next: Record<string, string> = {}
      for (const j of list) next[j.key] = gapDrafts.value[j.key] ?? (j.gap >= 0 ? toClock(j.gap) : '')
      gapDrafts.value = next
    },
    { immediate: true },
  )
  const gapBad = (key: string) => badGap(gapDrafts.value[key] ?? '')
  const gapsBad = computed(() => joins.value.some((j) => gapBad(j.key)))
  const mergeIdDraft = ref('')
  const mergeId = computed(() => mergeIdDraft.value.trim() || `${order.value[0]!.id}-m`)
  const canMerge = computed(() => picked.value.length > 0 && !gapsBad.value && busy.value === null)

  async function merge() {
    if (!canMerge.value) return
    busy.value = 'merge'
    try {
      const gaps = joins.value.map((j) => {
        const d = (gapDrafts.value[j.key] ?? '').trim()
        return d ? toSeconds(d) : null
      })
      const made: SyntheticVod = await admin.merge(props.vod.id, { sources: picked.value.map((v) => v.id), gaps, id: mergeIdDraft.value.trim() || undefined })
      notify(`Merged into ${made.id}; ${order.value.map((v) => v.id).join(', ')} are hidden now`, { duration: 4000 })
      picked.value = []
      mergeIdDraft.value = ''
      options.made(made.id)
    } catch (e) {
      notify(errorText(e), { kind: 'error', duration: 8000 })
    } finally {
      busy.value = null
    }
  }

  watch(
    () => props.vod.id,
    () => {
      cands.value = null
      picked.value = []
      void loadCandidates()
    },
    { immediate: true },
  )

  // ---- split ----
  const timeline = computed(() => {
    try {
      return new Timeline(normalizeVod(props.vod))
    } catch {
      return null
    }
  })
  const partEnds = computed(() => splitJoins(timeline.value))
  const atDraft = ref('')
  const at = computed(() => (atDraft.value.trim() ? toSeconds(atDraft.value) : NaN))
  const atBad = computed(() => atDraft.value.trim() !== '' && !(Number.isFinite(at.value) && at.value > 0 && at.value < self.value.duration))
  const splitIdDrafts = ref<[string, string]>(['', ''])
  const splitIds = computed<[string, string]>(() => [splitIdDrafts.value[0].trim() || `${props.vod.id}-1`, splitIdDrafts.value[1].trim() || `${props.vod.id}-2`])
  const canSplit = computed(() => atDraft.value.trim() !== '' && !atBad.value && busy.value === null)

  async function split() {
    if (!canSplit.value) return
    busy.value = 'split'
    try {
      const custom = splitIdDrafts.value.some((d) => d.trim())
      const made = await admin.split(props.vod.id, at.value, custom ? splitIds.value : undefined)
      notify(`Split into ${made.map((m) => m.id).join(' and ')}; ${props.vod.id} is hidden now`, { duration: 4000 })
      atDraft.value = ''
      splitIdDrafts.value = ['', '']
      if (made[0]) options.made(made[0].id)
    } catch (e) {
      notify(errorText(e), { kind: 'error', duration: 8000 })
    } finally {
      busy.value = null
    }
  }

  return {
    span: gapText,
    busy,
    cands,
    candsError,
    loadCandidates,
    suggestions,
    picked,
    pick,
    unpick,
    addDraft,
    addError,
    addById,
    order,
    joins,
    gapDrafts,
    gapBad,
    gapsBad,
    mergeIdDraft,
    mergeId,
    canMerge,
    merge,
    partEnds,
    atDraft,
    at,
    atBad,
    splitIdDrafts,
    splitIds,
    canSplit,
    split,
  }
}
