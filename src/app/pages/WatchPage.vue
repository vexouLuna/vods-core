<script setup lang="ts">
// /vods/:id, /live/:id and /youtube/:id. `?t=` is VOD time (wins), `?part=` starts a part from its beginning;
// with neither, playback resumes where this browser left off. A VOD merged into another one, or replaced by a
// synthetic VOD (a merge or split that keeps the original), sends you to the same moment in that one. A VOD cut in
// full (every chapter cut from the YouTube uploads) gets its own page saying so (the admin's reason, if given), with
// what was cut. A synthetic VOD with a compiled upload plays the version `?play=` names (segments or compiled), else
// the site's default.
import { useToast } from '@vex/ui/utils'
import { boxArt, isFinished, isResumable, parseTimestamp, redirectTarget, resumeProgress, toClock, toHMS, type Position, type UploadType } from '../../index'
import { useVodsContext, useWatch } from '../../vue/index'
import { computed, shallowRef, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WatchView from '../components/WatchView.vue'
import { site } from '../site'
import { cutNote } from '../lib/cuts'
import VodsShell from '../components/VodsShell.vue'
import ManageVodButton from '../components/ManageVodButton.vue'
import { siteOptions, type PlayDefault } from '../lib/siteOptions'

const props = defineProps<{ id: string; type: UploadType | null }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { progress } = useVodsContext()
const play = computed<PlayDefault>(() =>
  route.query.play === 'compiled' || route.query.play === 'segments' ? route.query.play : siteOptions.value.playDefault,
)
const { vod, sources, timeline, segments, uploadType, hasCompiled, download, loading, notFound, error, reload } = useWatch(
  () => props.id,
  () => props.type,
  play,
)
const switchTo = computed(() =>
  hasCompiled.value
    ? play.value === 'compiled'
      ? { label: 'Play the segments', to: `${route.path}?play=segments` }
      : { label: 'Play the compiled file', to: `${route.path}?play=compiled` }
    : null,
)

// Old links to a VOD that now plays inside another one: the later half of a merged broadcast, or an original a
// synthetic VOD replaces (merge or split). Same route type, same moment, and this browser's progress on the old id
// carries over.
const moved = computed(() => !!vod.value && redirectTarget(vod.value, 0) !== null)
watch(
  moved,
  async (m) => {
    const v = vod.value
    if (!m || !v) return
    const from = props.id
    let t = parseTimestamp(typeof route.query.t === 'string' ? route.query.t : null)
    if (!t) {
      const saved = await progress.get(from).catch(() => null)
      if (saved && isResumable(saved)) t = saved.t
    }
    if (props.id !== from) return
    const base = route.path.split('/')[1] || 'vods'
    const to = redirectTarget(v, t ?? 0)!
    router.replace({ path: `/${base}/${encodeURIComponent(to.id)}`, query: to.t > 0 ? { t: `${Math.floor(to.t)}s` } : {}, hash: route.hash })
  },
  { immediate: true },
)

const start = shallowRef<Position | null>(null)
watch(
  timeline,
  async (tl) => {
    start.value = null
    if (!tl || tl.isEmpty || moved.value) return
    const t = parseTimestamp(typeof route.query.t === 'string' ? route.query.t : null)
    const part = Number(route.query.part) || null
    if (!t && !part) {
      const saved = await progress.get(props.id).catch(() => null)
      if (tl !== timeline.value) return
      // Finished before it grew (a playthrough's new stream): picks up where the new part starts.
      const at = resumeProgress(saved, vod.value?.duration)
      if (saved && at) {
        start.value = tl.locate(at.t)
        toast.show(isFinished(saved) ? `New since you finished it: from ${toClock(at.t)}` : `Resumed at ${toClock(at.t)}`, { kind: 'info' })
        return
      }
    }
    start.value = tl.resolveStart({ t, part })
  },
  { immediate: true },
)

/** Nothing left to play: every chapter was cut (or is a merge's gap). */
const fullyCut = computed(() => {
  const ch = vod.value?.chapters ?? []
  return ch.length > 0 && ch.every((c) => c.restricted)
})

/** The other upload set, when this one is empty but that one isn't. */
const other = computed(() => {
  const v = vod.value
  if (!v || !timeline.value?.isEmpty) return null
  const alt: UploadType = uploadType.value === 'live' ? 'vod' : 'live'
  return v.uploads.some((u) => u.type === alt) ? `/${alt === 'vod' ? 'vods' : 'live'}/${v.id}` : null
})

/** A playthrough's parts are numbered within their stream: S1-P1, S1-P2, S2-P1… (a merge or split keeps P1, P2…). */
const partLabel = computed(() => {
  const seg = segments.value
  if (!seg || vod.value?.synthetic?.supersedes) return undefined
  return (i: number) => {
    const at = seg.clipInStream(i)
    return at ? `S${at.stream + 1}-P${at.part + 1}` : `P${i + 1}`
  }
})

const shareUrl = (t: number) => `${location.origin}${route.path}?t=${toHMS(t)}`

watchEffect(() => {
  document.title = vod.value ? `${vod.value.title} · ${site.name}` : site.name
})
</script>

<template>
  <WatchView
    v-if="vod && timeline && start && !moved && !fullyCut"
    :key="`${vod.id}:${uploadType}`"
    :vod="vod"
    :timeline="timeline"
    :segments="segments"
    :sources="sources"
    :part-label="partLabel"
    :start="start"
    :download="download"
    :share-url="shareUrl"
    :switch-to="switchTo"
  />
  <VodsShell v-else>
    <UiCallout v-if="error" tone="error" title="Couldn't load this VOD">
      {{ error.message }}
      <template #actions><UiButton size="sm" @click="reload">Try again</UiButton></template>
    </UiCallout>
    <UiEmptyState v-else-if="notFound" code="404" title="No VOD with that id" text="It may never have been archived, or the link is mistyped.">
      <template #actions><UiButton to="/vods" variant="primary">Browse VODs</UiButton></template>
    </UiEmptyState>
    <template v-else-if="vod && fullyCut && !moved">
      <UiEmptyState
        title="Cut in full"
        :text="vod.cutReason || `Every chapter of “${vod.title || 'Untitled stream'}” (${toClock(vod.duration)}) was cut from the YouTube uploads, so there's nothing left to play.`"
      >
        <template #actions>
          <UiButton :href="site.twitchUrl" external>Twitch channel</UiButton>
          <UiButton to="/vods" variant="primary">All VODs</UiButton>
        </template>
      </UiEmptyState>
      <section class="cut vods-panel" aria-label="What was cut">
        <ManageVodButton :id="vod.id" class="manage" />
        <div class="vods-eyebrow">What was cut · {{ vod.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }}</div>
        <ol class="cut-list">
          <li v-for="(c, i) in vod.chapters" :key="i" class="cut-row">
            <UiPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined }]" mode="row" :size="22" />
            <span class="name">{{ c.name }}</span>
            <span class="vods-mono vods-muted">{{ toClock(c.start) }} · {{ toClock(c.end - c.start) }}</span>
            <UiChip v-if="cutNote(c)" :title="cutNote(c)!.title">{{ cutNote(c)!.label }}</UiChip>
          </li>
        </ol>
      </section>
    </template>
    <UiEmptyState
      v-else-if="vod && timeline?.isEmpty && !moved"
      title="Not on YouTube yet"
      :text="`“${vod.title}” has no ${uploadType === 'live' ? 'live' : 'VOD'} uploads yet. Chat replay needs a video to follow.`"
    >
      <template #actions>
        <UiButton v-if="other" :to="other" variant="primary">Watch the other upload</UiButton>
        <UiButton :href="site.twitchUrl" external>Twitch channel</UiButton>
        <UiButton to="/vods">All VODs</UiButton>
      </template>
    </UiEmptyState>
    <div v-else-if="loading || !start" class="loading" aria-busy="true">
      <UiSkeleton ratio="16 / 9" h="auto" />
      <UiSkeleton w="60%" />
      <UiSkeleton w="30%" h="0.8em" />
    </div>
  </VodsShell>
</template>

<style scoped>
.loading { display: flex; flex-direction: column; gap: 10px; }
.cut { position: relative; display: flex; flex-direction: column; gap: 8px; margin: 14px auto 0; padding: 12px 14px; width: min(100%, 560px); }
.manage { top: 6px; right: 6px; }
.cut-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.cut-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px; font-size: 13px; }
.cut-row .name { overflow-wrap: anywhere; }
</style>
