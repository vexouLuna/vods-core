<script setup lang="ts">
// /manage/synthetic/new and /manage/synthetic/:id: a VOD made of windows of real ones (GET/POST/PUT/DELETE
// /api/v2/synthetic). A merge or split supersedes its sources (they leave the public lists and redirect into it); a
// playthrough, built from a game's windows, is listed beside them and tagged `compilation`.
import { useToast } from '@vex/ui/utils'
import { timeAgo } from '../../lib/time'
import { toClock } from '../../../index'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { errorText } from '@vex/platform-web'
import type { PlaythroughWindow, SyntheticInput, SyntheticVod } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import PlaythroughBuilder from '../../admin/PlaythroughBuilder.vue'
import { admin } from '../../admin/session'
import TimeInput from '../../admin/TimeInput.vue'
import { COMPLETE_TAG } from '../../lib/vodTags'
import { site } from '../../site'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const toast = useToast()
const isNew = computed(() => !props.id)

interface Row { key: number; vod_id: string; start: number | null; end: number | null; at: number | null; label: string }
let keys = 0
const row = (s: Partial<Row> = {}): Row => ({ key: keys++, vod_id: '', start: null, end: null, at: null, label: '', ...s })

const vod = ref<SyntheticVod | null>(null)
const loadError = ref<string | null>(null)
const notFound = ref(false)
const form = ref({ id: '', title: '', tags: '', supersedes: false })
const segments = ref<Row[]>([])
// The game a playthrough follows (the archive keeps its segments to that game's windows), or the one it was just built from.
const follow = ref<{ id: string; name: string | null } | null>(null)
const keepUp = ref(false)

function fill(v: SyntheticVod | null) {
  vod.value = v
  form.value = { id: v?.id ?? '', title: v?.title ?? '', tags: (v?.tags ?? []).join(', '), supersedes: v?.supersedes ?? false }
  segments.value = (v?.segments ?? []).map((s) => row({ vod_id: s.vod_id, start: s.start, end: s.end, at: s.at, label: s.label ?? '' }))
  if (!segments.value.length) segments.value = [row()]
  follow.value = v?.auto ? { id: v.auto.game_id, name: null } : null
  keepUp.value = !!v?.auto
}
async function load() {
  loadError.value = null
  notFound.value = false
  if (!props.id) return fill(null)
  vod.value = null
  try {
    fill(await admin.synthetic(props.id))
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound.value = true
    else loadError.value = errorText(e)
  }
}
watch(() => props.id, load, { immediate: true })

// ── segments ──
const move = (i: number, by: -1 | 1) => {
  const list = [...segments.value]
  ;[list[i], list[i + by]] = [list[i + by]!, list[i]!]
  segments.value = list
}
const remove = (i: number) => (segments.value = segments.value.filter((_, j) => j !== i))
const addRow = () => (segments.value = [...segments.value, row()])
function addWindows(windows: PlaythroughWindow[], game: string | null, gameId: string | null) {
  if (gameId) follow.value = { id: gameId, name: game }
  const kept = segments.value.filter((s) => s.vod_id.trim())
  segments.value = [...kept, ...windows.map((w) => row({ vod_id: w.segment.vod_id, start: w.segment.start, end: w.segment.end, label: w.segment.label }))]
  // A playthrough stands beside its sources and is tagged so.
  form.value.supersedes = false
  const tags = tagList.value
  if (!tags.includes('compilation')) form.value.tags = [...tags, 'compilation'].join(', ')
  if (!form.value.title.trim() && game) form.value.title = `${game} playthrough`
  builderOpen.value = false
}
const builderOpen = ref(false)

// ── checks ──
const tagList = computed(() => [...new Set(form.value.tags.split(',').map((t) => t.trim()).filter(Boolean))])
// A playthrough played to the end gets the `complete` tag (a tag on its thumbnail).
const complete = computed({
  get: () => tagList.value.includes(COMPLETE_TAG),
  set: (on: boolean) => {
    const rest = tagList.value.filter((t) => t !== COMPLETE_TAG)
    form.value.tags = (on ? [...rest, COMPLETE_TAG] : rest).join(', ')
  },
})
const idError = computed(() => {
  if (!isNew.value) return null
  const id = form.value.id.trim()
  if (!id) return 'Give it an id.'
  if (/^\d+$/.test(id)) return "Not only digits: those are Twitch's VOD ids."
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return 'Letters, digits, - and _ only.'
  return null
})
const segError = (s: Row) =>
  !/^\d+$/.test(s.vod_id.trim()) ? 'A Twitch VOD id.' : s.start != null && s.end != null && s.end <= s.start ? 'The end must come after the start.' : null
const segErrors = computed(() => segments.value.map(segError))
const valid = computed(() => !idError.value && segments.value.length > 0 && segErrors.value.every((e) => !e))
const total = computed(() =>
  segments.value.every((s) => s.start != null && s.end != null) ? segments.value.reduce((n, s) => n + (s.end! - s.start!), 0) : null,
)

// ── save / delete ──
const saving = ref(false)
const saveError = ref<string | null>(null)
async function save() {
  if (!valid.value) return
  saving.value = true
  saveError.value = null
  const body: SyntheticInput = {
    title: form.value.title.trim() || null,
    supersedes: form.value.supersedes,
    tags: tagList.value,
    segments: segments.value.map((s) => ({
      vod_id: s.vod_id.trim(),
      ...(s.start != null ? { start: s.start } : {}),
      ...(s.end != null ? { end: s.end } : {}),
      ...(s.at != null ? { at: s.at } : {}),
      ...(s.label.trim() ? { label: s.label.trim() } : {}),
    })),
  }
  // Following a game, the archive makes the segments (it ignores these); without, they are a hand edit, which stops it.
  if (keepUp.value && follow.value) body.auto = { game_id: follow.value.id }
  try {
    if (isNew.value) {
      const made = await admin.createSynthetic({ ...body, id: form.value.id.trim() })
      toast.show(`Made ${made.id}`)
      router.replace(`/manage/synthetic/${encodeURIComponent(made.id)}`)
    } else {
      fill(await admin.updateSynthetic(props.id!, body))
      toast.show('Saved')
    }
  } catch (e) {
    saveError.value = errorText(e)
  } finally {
    saving.value = false
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)
async function destroy() {
  deleting.value = true
  try {
    await admin.deleteSynthetic(props.id!)
    toast.show(`Deleted ${props.id}`)
    router.push('/manage/vods?synthetic=true')
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    deleting.value = false
    deleteOpen.value = false
  }
}

const when = (at: string | null) => (at ? new Date(at).toLocaleString() : '—')
watchEffect(() => (document.title = `${props.id ?? 'New synthetic VOD'} · Manage · ${site.name}`))
</script>

<template>
  <ManageShell :title="isNew ? 'New synthetic VOD' : `Synthetic VOD ${id}`">
    <template #actions>
      <UiButton v-if="!isNew" :to="`/vods/${encodeURIComponent(id!)}`">Watch page</UiButton>
      <UiButton v-if="!isNew" variant="danger" @click="deleteOpen = true">Delete</UiButton>
    </template>
    <p class="back"><RouterLink to="/manage/vods?synthetic=true">← Synthetic VODs</RouterLink></p>

    <UiCallout v-if="notFound" tone="warn" title="No such synthetic VOD">The archive has no synthetic VOD {{ id }}.</UiCallout>
    <UiCallout v-else-if="loadError" tone="error" title="Couldn't load it">
      {{ loadError }}
      <template #actions><UiButton size="sm" @click="load">Try again</UiButton></template>
    </UiCallout>
    <div v-else-if="!isNew && !vod" class="sk" aria-busy="true"><UiSkeleton h="90px" /><UiSkeleton h="200px" /></div>

    <form v-else @submit.prevent="save">
      <section v-if="vod" class="panel vods-panel">
        <dl class="facts">
          <div><dt>Length</dt><dd class="vods-mono">{{ vod.duration ?? '—' }}</dd></div>
          <div><dt>Streamed</dt><dd>{{ when(vod.created_at) }}</dd></div>
          <div><dt>Made</dt><dd :title="when(vod.made_at)">{{ vod.made_at ? timeAgo(vod.made_at) : '—' }}</dd></div>
          <div><dt>Changed</dt><dd :title="when(vod.changed_at)">{{ vod.changed_at ? timeAgo(vod.changed_at) : '—' }}</dd></div>
          <div><dt>Visibility</dt><dd><UiChip :tone="vod.hidden ? 'warn' : 'ok'">{{ vod.hidden ? 'hidden' : 'public' }}</UiChip></dd></div>
        </dl>
        <p class="vods-muted small">Hiding it, and its chapters and the like, are on <RouterLink :to="`/manage/vods/${encodeURIComponent(vod.id)}`">its VOD page</RouterLink>.</p>
      </section>

      <section class="panel vods-panel">
        <h2 class="vods-eyebrow sec">Details</h2>
        <div class="fields">
          <UiField v-if="isNew" label="Id" :error="form.id && idError ? idError : undefined" help="In its link: /vods/<id>. Can't change later.">
            <template #default="{ id: fid }"><UiInput :id="fid" v-model="form.id" mono placeholder="elden-ring" /></template>
          </UiField>
          <UiField label="Title" help="Empty: the first source's.">
            <template #default="{ id: fid }"><UiInput :id="fid" v-model="form.title" /></template>
          </UiField>
          <UiField label="Tags" help="Comma-separated; a playthrough is tagged compilation, and complete once played to the end.">
            <template #default="{ id: fid }"><UiInput :id="fid" v-model="form.tags" placeholder="compilation" /></template>
          </UiField>
        </div>
        <UiCheckbox v-model="complete" label="Played to the end: shows a complete tag on its thumbnail" />
        <UiCheckbox v-model="form.supersedes" label="Stands in for its sources (a merge or split): they leave the public lists and redirect here" />
        <UiCheckbox
          v-if="follow"
          v-model="keepUp"
          :label="`Keep up to date: every window of ${follow.name ?? `game ${follow.id}`}, new streams included (the segments below then aren't saved)`"
        />
      </section>

      <section class="panel vods-panel">
        <div class="head">
          <h2 class="vods-eyebrow sec">Segments</h2>
          <span class="vods-muted small">{{ segments.length }} · {{ total == null ? 'some run to their source’s end' : toClock(total) }}</span>
          <UiButton size="sm" class="push" @click="builderOpen = !builderOpen">{{ builderOpen ? 'Close builder' : 'Build a playthrough…' }}</UiButton>
        </div>
        <div v-if="builderOpen" class="builder"><PlaythroughBuilder @add="addWindows" /></div>
        <p class="vods-muted small">
          Each is a window of a Twitch VOD, played one after another. Empty start or end: the source's own; empty
          “at”: right after the one before.
        </p>
        <ol class="segs">
          <li v-for="(s, i) in segments" :key="s.key" class="seg">
            <span class="n vods-mono">{{ i + 1 }}</span>
            <UiField label="VOD" :error="s.vod_id && segErrors[i] ? segErrors[i]! : undefined">
              <template #default="{ id: fid }"><UiInput :id="fid" v-model="s.vod_id" mono placeholder="2200000000" class="vodid" /></template>
            </UiField>
            <UiField label="Start"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.start" optional placeholder="start" /></template></UiField>
            <UiField label="End"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.end" optional placeholder="end" /></template></UiField>
            <UiField label="At"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.at" optional placeholder="next" /></template></UiField>
            <UiField label="Label" class="grow">
              <template #default="{ id: fid }"><UiInput :id="fid" v-model="s.label" placeholder="Part 1" /></template>
            </UiField>
            <span class="acts">
              <UiButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move segment ${i + 1} up`" @click="move(i, -1)">↑</UiButton>
              <UiButton size="sm" variant="ghost" :disabled="i === segments.length - 1" :aria-label="`Move segment ${i + 1} down`" @click="move(i, 1)">↓</UiButton>
              <UiButton size="sm" variant="ghost" :aria-label="`Remove segment ${i + 1}`" @click="remove(i)">✕</UiButton>
            </span>
          </li>
        </ol>
        <UiButton size="sm" @click="addRow">Add a segment</UiButton>
      </section>

      <UiCallout v-if="saveError" tone="error" title="Couldn't save">{{ saveError }}</UiCallout>
      <div class="save">
        <UiButton type="submit" variant="primary" :loading="saving" :disabled="!valid">{{ isNew ? 'Make it' : 'Save' }}</UiButton>
        <UiButton v-if="!isNew" :disabled="saving" @click="fill(vod)">Undo changes</UiButton>
      </div>
    </form>

    <UiDialog v-model:open="deleteOpen" :title="`Delete ${id}?`">
      Its link stops working and, if it stood in for its sources, they come back. The sources themselves aren't touched.
      <template #actions="{ close }">
        <UiButton @click="close">Cancel</UiButton>
        <UiButton variant="danger-solid" :loading="deleting" @click="destroy">Delete</UiButton>
      </template>
    </UiDialog>
  </ManageShell>
</template>

<style scoped>
a { color: inherit; }
.back { margin: -8px 0 16px; font-size: 13px; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.panel { padding: 14px 16px; margin-bottom: 16px; }
.sec { margin: 0 0 8px; }
.small { font-size: 13px; margin: 8px 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 16px; margin: 0; }
dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.6; margin-bottom: 2px; }
dd { margin: 0; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 4px 12px; margin-bottom: 8px; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.head .sec { margin: 0; }
.push { margin-left: auto; }
.builder { margin: 10px 0; padding: 12px; border: 1px solid var(--vods-line); border-radius: var(--vods-radius, 8px); }
.segs { list-style: none; margin: 8px 0 12px; padding: 0; display: grid; gap: 8px; }
.seg { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 10px; padding-top: 8px; border-top: 1px solid var(--vods-line); }
.seg > * { margin: 0; }
.n { align-self: center; min-width: 1.5em; opacity: 0.6; }
.vodid { width: 9.5rem; }
.grow { flex: 1 1 10rem; }
.acts { display: flex; gap: 2px; }
.save { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
