<script setup lang="ts">
// The top of /manage/vods/:id and /manage/synthetic/:id, the same on both: the title, the visibility switch, then
// title, tags and cut reason (PATCH /api/v2/vods/:id, which takes them on every VOD). The tags input shows the VOD's
// states and automatic tags first, locked; its own tags are picked from the site's. The page's facts go in the slot.
import { useToast } from '@vex/ui/utils'
import { computed, ref, watch } from 'vue'
import { errorText } from '@vex/platform-web'
import type { AdminVod } from './api'
import { CUT_REASON_MAX, headerDraft, headerErrors, headerPatch, lockedTags, type HeaderDraft } from './edits'
import { admin } from './session'
import { isAutoTag, tagConfig } from '../lib/vodTags'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const draft = ref<HeaderDraft>(headerDraft(props.vod))
const error = ref<string | null>(null)
const saving = ref(false)
function reset() {
  draft.value = headerDraft(props.vod)
  error.value = null
}
watch(() => JSON.stringify(headerDraft(props.vod)), reset)

const errors = computed(() => headerErrors(draft.value))
const patch = computed(() => headerPatch(draft.value, props.vod))
const dirty = computed(() => Object.keys(patch.value).length > 0)
/** A VOD merged into another takes only `hidden`. */
const merged = computed(() => !!props.vod.merged_into)
const locked = computed(() => lockedTags(props.vod))
const options = computed(() =>
  Object.entries(tagConfig.value)
    .filter(([name]) => !isAutoTag(name))
    .map(([value, t]) => ({ value, color: t.color, hint: [t.label !== value && t.label, t.page && `/${t.page}`].filter(Boolean).join(' · ') || undefined })),
)

/** Lets the page add to the draft (the playthrough builder tags what it builds and names it). */
function suggest(s: { tag?: string; title?: string }) {
  if (s.tag && !draft.value.tags.includes(s.tag)) draft.value.tags = [...draft.value.tags, s.tag]
  if (s.title && !draft.value.title.trim()) draft.value.title = s.title
}
defineExpose({ suggest })

async function save() {
  if (errors.value.size || !dirty.value) return
  saving.value = true
  error.value = null
  try {
    const vod = await admin.updateVod(props.vod.id, patch.value)
    toast.show('Saved', { duration: 3000 })
    emit('saved', vod)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    saving.value = false
  }
}

// Visibility: hiding asks first, since the VOD's links stop working; showing it again doesn't.
const hideOpen = ref(false)
const hiding = ref(false)
function toggleHidden(show: boolean) {
  if (!show) hideOpen.value = true
  else void setHidden(false)
}
async function setHidden(hidden: boolean) {
  hiding.value = true
  try {
    const vod = await admin.updateVod(props.vod.id, { hidden })
    hideOpen.value = false
    toast.show(hidden ? 'Hidden from the site' : 'Public again', { duration: 3000 })
    emit('saved', vod)
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  } finally {
    hiding.value = false
  }
}
</script>

<template>
  <section class="panel vods-panel vx-glass-rim">
    <h2 class="title">{{ vod.title ?? 'Untitled' }}</h2>
    <div class="visibility">
      <UiSwitch :id="`vod-public-${vod.id}`" :model-value="!vod.hidden" :disabled="hiding" @update:model-value="toggleHidden" />
      <label :for="`vod-public-${vod.id}`">
        <strong>{{ vod.hidden ? 'Hidden' : 'Public' }}</strong>
        <span class="vods-muted"> · {{ vod.hidden ? 'only Manage shows it' : 'on the site for everyone' }}</span>
      </label>
    </div>
    <slot />

    <form class="fields" @submit.prevent="save">
      <UiCallout v-if="merged" tone="info">Merged into another VOD: only its visibility can change.</UiCallout>
      <UiField label="Title" :error="errors.get('title')">
        <template #default="{ id }"><UiInput :id="id" v-model="draft.title" :disabled="merged" :invalid="errors.has('title')" /></template>
      </UiField>
      <UiField label="Tags" help="Locked ones follow the VOD: hide it with the switch above; the archive sets the rest.">
        <template #default="{ id }">
          <UiTagInput :id="id" v-model="draft.tags" :options="options" :locked="locked" :disabled="merged" placeholder="add a tag…" />
        </template>
      </UiField>
      <UiField
        label="Why it was cut"
        help="Shown on its page once every chapter is cut. Empty: “cut from the YouTube uploads” and each chapter’s cut note."
        :error="errors.get('cutReason')"
      >
        <template #default="{ id }">
          <UiTextarea :id="id" v-model="draft.cutReason" :rows="2" :maxlength="CUT_REASON_MAX" :disabled="merged" />
        </template>
      </UiField>

      <UiCallout v-if="error" tone="error" title="Couldn't save">{{ error }}</UiCallout>
      <div class="foot">
        <UiButton :disabled="!dirty || saving" @click="reset">Undo changes</UiButton>
        <UiButton type="submit" variant="primary" :loading="saving" :disabled="merged || !dirty || errors.size > 0">Save</UiButton>
      </div>
    </form>

    <UiConfirm v-model:open="hideOpen" title="Hide this VOD?" width="460px" tone="danger" confirm-label="Hide it" :loading="hiding" @confirm="setHidden(true)">
      It leaves the public site at once: the VOD list and the chat. Links to its watch page stop
      working (they show "not found") until it's made public again. Nothing is deleted.
    </UiConfirm>
  </section>
</template>

<style scoped>
.panel { padding: 14px 16px; margin-bottom: 16px; }
.title { margin: 0 0 8px; font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
.visibility { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 13px; }
.visibility label { cursor: pointer; }
.fields { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--vods-line); }
.foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
</style>
