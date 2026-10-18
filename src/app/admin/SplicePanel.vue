<script setup lang="ts">
// Merge and split for one VOD. Merge: when a stream dropped and Twitch made two VODs of one broadcast, the later one
// is appended to this one, the time between becoming a "Technical difficulties" gap chapter. Split: from a point
// between two parts on becomes a new VOD. Both move chat with the video and can be undone (latest first). The logic
// is useSplice's; this draws it.
import { useToast } from '@vex/ui/utils'
import { toClock, toSeconds } from '../../index'
import { stamp } from '@vex/platform-web'
import type { AdminVod } from './api'
import { useSplice } from '../composables/useSplice'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ changed: []; job: [jobId: number] }>()
const toast = useToast()

const {
  span,
  describeSplice,
  mergedInto,
  splices,
  touched,
  warnings,
  describing,
  describe,
  busy,
  forceAsk,
  forceUndo,
  cands,
  candsError,
  loadCandidates,
  mergeOf,
  gapDraft,
  gapBad,
  askMerge,
  merge,
  joins,
  atDraft,
  at,
  atBad,
  splitErr,
  splitOpen,
  split,
  inGap,
  undo,
  unmergeHere,
} = useSplice(props, {
  changed: () => emit('changed'),
  job: (id) => emit('job', id),
  notify: (message, options) => toast.show(message, options),
})
</script>

<template>
  <div class="splices">
    <UiCallout v-if="touched.length" tone="warn" title="Update the YouTube descriptions">
      The descriptions of {{ touched.join(' and ') }} still list the parts as they were.
      <template #actions>
        <UiButton size="sm" variant="primary" :loading="describing" @click="describe">Update descriptions</UiButton>
        <UiButton v-for="id in touched.filter((x) => x !== vod.id)" :key="id" size="sm" :to="`/manage/vods/${id}`">Open {{ id }}</UiButton>
        <UiButton size="sm" @click="touched = []">Later</UiButton>
      </template>
    </UiCallout>

    <UiCallout v-if="warnings.length" tone="warn" title="Merged, with a warning">
      <p v-for="(w, i) in warnings" :key="i" class="warning">{{ w }}</p>
      <template #actions><UiButton size="sm" @click="warnings = []">OK</UiButton></template>
    </UiCallout>

    <UiCallout v-if="mergedInto" tone="info" title="Merged into another VOD">
      Its video, chapters and chat are part of <RouterLink :to="`/manage/vods/${mergedInto.id}`" class="vods-mono">{{ mergedInto.id }}</RouterLink>
      now, from {{ toClock(mergedInto.offset) }}. Old links to this VOD open that one at the same moment.
      <template #actions>
        <UiButton size="sm" :to="`/manage/vods/${mergedInto.id}`">Open {{ mergedInto.id }}</UiButton>
        <UiButton size="sm" :loading="busy === 'unmerge'" @click="unmergeHere">Unmerge</UiButton>
      </template>
    </UiCallout>

    <template v-else>
      <div class="group">
        <div class="vods-eyebrow">Merge the next VOD into this one</div>
        <p class="vods-muted note">
          For a stream that dropped and came back as a second Twitch VOD. The time between becomes a “Technical
          difficulties” chapter; nothing is downloaded or uploaded again. Also for a stream whose first or last section
          was lost: either VOD may have no uploads, and the site keeps counting its time.
        </p>
        <UiCallout v-if="candsError" tone="error">
          {{ candsError }}
          <template #actions><UiButton size="sm" @click="loadCandidates">Try again</UiButton></template>
        </UiCallout>
        <UiSkeleton v-else-if="!cands" h="40px" />
        <p v-else-if="!cands.candidates.length" class="vods-muted note">
          No VOD started within {{ cands.withinMinutes }} minutes of this one's end ({{ stamp(cands.vod.endsAt) }}).
        </p>
        <ul v-else class="list">
          <li v-for="c in cands.candidates" :key="c.id" class="row">
            <div class="what">
              <RouterLink :to="`/manage/vods/${c.id}`" class="vods-mono">{{ c.id }}</RouterLink>
              <span class="title">{{ c.title || 'Untitled' }}</span>
              <span class="vods-muted small" :title="stamp(c.createdAt)">{{ new Date(c.createdAt).toLocaleString() }} · {{ c.duration }}</span>
            </div>
            <div class="chips">
              <UiChip v-if="c.overlaps" tone="bad" title="It started before this one ended">overlaps {{ span(c.gap) }}</UiChip>
              <UiChip v-else k="down">{{ span(c.gap) }}</UiChip>
              <UiChip v-if="c.titlesMatch" tone="ok">same title</UiChip>
              <UiChip v-else tone="warn">other title</UiChip>
            </div>
            <UiButton size="sm" :loading="busy === `merge-${c.id}`" @click="askMerge(c)">Merge…</UiButton>
          </li>
        </ul>
      </div>

      <div class="group">
        <div class="vods-eyebrow">Split</div>
        <p class="vods-muted note">
          From that point on becomes a new VOD ({{ vod.id }}-2), with its parts, chapters and chat. It has to be where
          one part ends and the next starts; inside a merge's gap chapter it undoes that merge instead.
        </p>
        <form class="split" @submit.prevent="!atBad && atDraft.trim() && (splitOpen = true)">
          <UiInput v-model="atDraft" mono placeholder="H:MM:SS" aria-label="Split at" :invalid="atBad" class="at" />
          <UiButton type="submit" :disabled="atBad || !atDraft.trim()" :loading="busy === 'split'">Split here…</UiButton>
          <template v-if="joins.length">
            <span class="vods-muted small">Part ends:</span>
            <UiChip v-for="j in joins" :key="j.at" clickable :active="at === j.at" :title="j.label" @click="atDraft = toClock(j.at)">{{ toClock(j.at) }}</UiChip>
          </template>
        </form>
        <UiCallout v-if="splitErr" tone="warn" title="Not there">
          {{ splitErr.msg }}
          <div class="points">
            <UiChip v-for="p in splitErr.points" :key="p.at" clickable :title="p.from !== p.to ? `anywhere from ${toClock(p.from)} to ${toClock(p.to)}` : undefined" @click="atDraft = toClock(p.at)">
              {{ toClock(p.at) }}<template v-if="p.from !== p.to"> ({{ toClock(p.from) }}–{{ toClock(p.to) }})</template>
            </UiChip>
          </div>
        </UiCallout>
      </div>
    </template>

    <div v-if="splices.length" class="group">
      <div class="vods-eyebrow">History</div>
      <ul class="list">
        <li v-for="sp in splices" :key="sp.id" class="row" :class="{ undone: sp.undoneAt }">
          <div class="what">
            <span>{{ describeSplice(sp) }}</span>
            <span class="vods-muted small">
              {{ stamp(sp.createdAt) }}<template v-if="sp.undoneAt"> · undone {{ stamp(sp.undoneAt) }}</template>
            </span>
          </div>
          <UiChip v-if="sp.undoneAt">undone</UiChip>
          <UiButton
            v-else
            size="sm"
            :disabled="!sp.undoable"
            :title="sp.undoable ? undefined : 'A later merge or split of one of these VODs has to be undone first'"
            :loading="busy === `undo-${sp.id}`"
            @click="undo(sp)"
          >
            {{ sp.kind === 'merge' ? 'Unmerge' : 'Unsplit' }}
          </UiButton>
        </li>
      </ul>
    </div>

    <UiDialog :open="!!mergeOf" :title="`Merge ${mergeOf?.id} into ${vod.id}?`" @update:open="(o: boolean) => !o && (mergeOf = null)">
      <template v-if="mergeOf">
        {{ mergeOf.id }} becomes the rest of {{ vod.id }}: its parts, chapters, chat and emotes move here, after a
        “Technical difficulties” chapter of {{ gapDraft.trim() && !gapBad ? span(toSeconds(gapDraft)) : mergeOf.overlaps ? 'the gap you set' : span(mergeOf.gap) }}. Its page sends
        viewers here. You can unmerge it later.
        <div class="form">
          <UiField label="Gap (optional)" :error="gapBad ? 'Seconds or H:MM:SS, 0 or more.' : mergeOf.overlaps ? 'The start times overlap; set the real gap.' : undefined">
            <template #default="{ id }"><UiInput :id="id" v-model="gapDraft" mono :placeholder="`${mergeOf.gap} (from the start times)`" :invalid="gapBad" /></template>
          </UiField>
        </div>
      </template>
      <template #actions="{ close }">
        <UiButton @click="close">Cancel</UiButton>
        <UiButton variant="primary" :disabled="gapBad || (mergeOf?.overlaps && !gapDraft.trim())" @click="merge">Merge</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="splitOpen" :title="inGap ? `Undo the merge at ${toClock(at)}?` : `Split ${vod.id} at ${toClock(at)}?`">
      <template v-if="inGap">That's inside a merge's gap chapter, so this undoes that merge.</template>
      <template v-else>Everything from {{ toClock(at) }} on becomes a new VOD with its own page. You can unsplit it later.</template>
      <template #actions="{ close }">
        <UiButton @click="close">Cancel</UiButton>
        <UiButton variant="primary" @click="split">{{ inGap ? 'Undo the merge' : 'Split' }}</UiButton>
      </template>
    </UiDialog>

    <UiDialog :open="!!forceAsk" title="Undo anyway?" @update:open="(o: boolean) => !o && (forceAsk = null)">
      These were edited since: <span class="vods-mono">{{ forceAsk?.edited.join(', ') }}</span>. Undoing puts the rows back
      as they were before, so those edits are lost.
      <template #actions="{ close }">
        <UiButton @click="close">Keep them</UiButton>
        <UiButton variant="danger-solid" @click="forceUndo">Undo and lose them</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
a { color: inherit; }
.splices { display: flex; flex-direction: column; gap: 14px; }
.group { display: flex; flex-direction: column; gap: 6px; }
.note { margin: 0; font-size: 13px; max-width: 72ch; }
.small { font-size: 12px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 10px; border: 1px solid var(--vods-line); border-radius: 6px; }
.row.undone { opacity: 0.6; }
.what { display: flex; flex-direction: column; gap: 2px; flex: 1 1 240px; min-width: 0; }
.what .title { overflow-wrap: anywhere; }
.chips, .points { display: flex; flex-wrap: wrap; gap: 6px; }
.points { margin-top: 8px; }
.warning { margin: 0 0 4px; }
.split { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.at { width: 120px; }
.form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
</style>
