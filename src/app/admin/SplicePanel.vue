<script setup lang="ts">
// Merge and split for one VOD: both make synthetic VODs tagged `vods` and hide the VODs they're made of; deleting the
// synthetic VOD undoes it. Merge: this VOD and the ones picked (suggestions within 24 h, or by id), in start order, a
// gap before each. Split: before and after any second. The logic is useSplice's; this draws it.
import { useToast } from '@vex/ui/utils'
import { useRouter } from 'vue-router'
import { toClock } from '../../index'
import { stamp } from '@vex/platform-web'
import type { AdminVod } from './api'
import { useSplice } from '../composables/useSplice'

const props = defineProps<{ vod: AdminVod }>()
const toast = useToast()
const router = useRouter()

const {
  span,
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
} = useSplice(props, {
  made: (id) => void router.push(`/manage/synthetic/${encodeURIComponent(id)}`),
  notify: (message, options) => toast.show(message, options),
})
</script>

<template>
  <div class="splices">
    <div class="group">
      <div class="vods-eyebrow">Merge</div>
      <p class="vods-muted note">
        For a stream that dropped and came back as more Twitch VODs: they play as one synthetic VOD, in the order they
        started, and are hidden (their links lead into it). Nothing is downloaded or uploaded again. Delete it to undo.
      </p>

      <div class="sub vods-muted small">Suggested: starting less than 24 h after this one ends, or ending less than 24 h before it starts</div>
      <UiCallout v-if="candsError" tone="error">
        {{ candsError }}
        <template #actions><UiButton size="sm" @click="loadCandidates">Try again</UiButton></template>
      </UiCallout>
      <UiSkeleton v-else-if="!cands" h="40px" />
      <p v-else-if="!suggestions.length" class="vods-muted note">{{ cands.length ? 'All of them are in the merge.' : 'None.' }}</p>
      <ul v-else class="list">
        <li v-for="c in suggestions" :key="c.id" class="row">
          <div class="what">
            <RouterLink :to="`/manage/vods/${c.id}`" class="vods-mono">{{ c.id }}</RouterLink>
            <span class="title">{{ c.title || 'Untitled' }}</span>
            <span class="vods-muted small" :title="stamp(c.created_at)">{{ new Date(c.created_at).toLocaleString() }} · {{ c.duration ?? '—' }}</span>
          </div>
          <div class="chips">
            <UiChip v-if="c.gap < 0" tone="bad" title="They overlap">overlaps {{ span(c.gap) }}</UiChip>
            <UiChip v-else>{{ span(c.gap) }} apart</UiChip>
            <UiChip v-if="c.titles_match" tone="ok">same title</UiChip>
            <UiChip v-else tone="warn">other title</UiChip>
          </div>
          <UiButton size="sm" @click="pick(c)">Add</UiButton>
        </li>
      </ul>

      <form class="inline" @submit.prevent="addById">
        <UiField label="Add a VOD by id" :error="addError ?? undefined">
          <template #default="{ id }"><UiInput :id="id" v-model="addDraft" mono placeholder="2200000000" class="vodid" :invalid="!!addError" /></template>
        </UiField>
        <UiButton type="submit" :disabled="!addDraft.trim()" :loading="busy === 'add'">Add</UiButton>
      </form>

      <template v-if="picked.length">
        <div class="sub vods-muted small">The merge, in start order</div>
        <ol class="list">
          <template v-for="(v, i) in order" :key="v.id">
            <li v-if="i > 0" class="gap">
              <UiField
                :label="`Gap before ${v.id}`"
                :error="gapBad(joins[i - 1]!.key) ? 'Seconds or H:MM:SS, 0 or more.' : undefined"
                :help="joins[i - 1]!.gap < 0 ? `They overlap by ${span(joins[i - 1]!.gap)}: empty starts it where it started, cutting the end of the one before.` : `From the start times: ${toClock(joins[i - 1]!.gap)}. Empty: where it started.`"
              >
                <template #default="{ id }"><UiInput :id="id" v-model="gapDrafts[joins[i - 1]!.key]" mono placeholder="where it started" class="gapin" /></template>
              </UiField>
            </li>
            <li class="row">
              <div class="what">
                <span><span class="vods-mono">{{ v.id }}</span><template v-if="v.id === vod.id"> (this VOD)</template></span>
                <span class="title">{{ v.title || 'Untitled' }}</span>
                <span class="vods-muted small">{{ new Date(v.createdAt).toLocaleString() }} · {{ toClock(v.duration) }}</span>
              </div>
              <UiButton v-if="v.id !== vod.id" size="sm" variant="ghost" :aria-label="`Take ${v.id} out of the merge`" @click="unpick(v.id)">Remove</UiButton>
            </li>
          </template>
        </ol>
        <form class="inline" @submit.prevent="merge">
          <UiField label="Id" help="In its link: /vods/<id>.">
            <template #default="{ id }"><UiInput :id="id" v-model="mergeIdDraft" mono :placeholder="mergeId" class="vodid" /></template>
          </UiField>
          <UiButton type="submit" variant="primary" :disabled="!canMerge || gapsBad" :loading="busy === 'merge'">Merge {{ order.length }} VODs</UiButton>
        </form>
      </template>
    </div>

    <div class="group">
      <div class="vods-eyebrow">Split</div>
      <p class="vods-muted note">
        Two synthetic VODs, before and after the point, at any second; {{ vod.id }} is hidden (its links lead to the
        halves). Delete both to undo.
      </p>
      <form class="inline" @submit.prevent="split">
        <UiField label="At" :error="atBad ? 'Inside the VOD: H:MM:SS or seconds.' : undefined">
          <template #default="{ id }"><UiInput :id="id" v-model="atDraft" mono placeholder="H:MM:SS" :invalid="atBad" class="at" /></template>
        </UiField>
        <UiField label="First id">
          <template #default="{ id }"><UiInput :id="id" v-model="splitIdDrafts[0]" mono :placeholder="splitIds[0]" class="vodid" /></template>
        </UiField>
        <UiField label="Second id">
          <template #default="{ id }"><UiInput :id="id" v-model="splitIdDrafts[1]" mono :placeholder="splitIds[1]" class="vodid" /></template>
        </UiField>
        <UiButton type="submit" :disabled="!canSplit" :loading="busy === 'split'">Split</UiButton>
      </form>
      <div v-if="partEnds.length" class="chips">
        <span class="vods-muted small">Part ends:</span>
        <UiChip v-for="j in partEnds" :key="j.at" clickable :active="at === j.at" :title="j.label" @click="atDraft = toClock(j.at)">{{ toClock(j.at) }}</UiChip>
      </div>
    </div>
  </div>
</template>

<style scoped>
a { color: inherit; }
.splices { display: flex; flex-direction: column; gap: 14px; }
.group { display: flex; flex-direction: column; gap: 6px; }
.note { margin: 0; font-size: 13px; max-width: 72ch; }
.small { font-size: 12px; }
.sub { margin-top: 6px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 10px; border: 1px solid var(--vods-line); border-radius: 6px; }
.gap { padding-left: 16px; }
.gap > * { margin: 0; }
.what { display: flex; flex-direction: column; gap: 2px; flex: 1 1 240px; min-width: 0; }
.what .title { overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.inline { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 10px; }
.inline > * { margin: 0; }
.vodid { width: 11rem; max-width: 100%; }
.at, .gapin { width: 9rem; }
</style>
