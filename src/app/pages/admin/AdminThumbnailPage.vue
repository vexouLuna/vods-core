<script setup lang="ts">
// /manage/thumbnails: the YouTube thumbnail template. Lines of text with {fields} over a frame of each part; the
// preview is the worker's own drawing of it (as YouTube will get it), over a frame of a VOD still on the worker, or a
// plain one. The worker sets it after each upload while its youtube_thumbnail setting is on; "Make them again" does it
// for a VOD's existing uploads.
import { errorText } from '@vex/platform-web'
import type { Option } from '@vex/ui'
import { useToast } from '@vex/ui/utils'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ThumbnailLine, ThumbnailTemplate } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import { admin } from '../../admin/session'
import { lineErrors, newLine, THUMBNAIL_MAX_LINES, THUMBNAIL_SIZE, THUMBNAIL_TEXT_MAX, templateError } from '../../admin/thumbnail'

const toast = useToast()

const ALIGN: Option<ThumbnailLine['align']>[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
]
const TYPES: Option<'vod' | 'live' | 'compiled'>[] = [
  { value: 'vod', label: 'VOD' },
  { value: 'live', label: 'Live' },
  { value: 'compiled', label: 'Compiled' },
]
const pct = (v: number) => Math.round(v * 100)

const template = ref<ThumbnailTemplate | null>(null)
const saved = ref('')
const isSaved = ref(false)
const fields = ref<string[]>([])
const loadError = ref<string | null>(null)
const saving = ref(false)

const errors = computed(() => (template.value ? lineErrors(template.value, fields.value) : []))
const problem = computed(() => (template.value ? templateError(template.value, fields.value) : null))
const dirty = computed(() => !!template.value && JSON.stringify(template.value) !== saved.value)

async function load() {
  loadError.value = null
  try {
    const s = await admin.thumbnailTemplate()
    template.value = s.template
    saved.value = JSON.stringify(s.template)
    isSaved.value = s.saved
    fields.value = s.fields
  } catch (e) {
    loadError.value = errorText(e)
  }
}

async function save() {
  if (!template.value || problem.value) return
  saving.value = true
  try {
    const s = await admin.saveThumbnailTemplate(template.value)
    template.value = s.template
    saved.value = JSON.stringify(s.template)
    isSaved.value = true
    toast.show('Template saved: the next uploads get it.', { duration: 3000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    saving.value = false
  }
}

function revert() {
  if (saved.value) template.value = JSON.parse(saved.value) as ThumbnailTemplate
}

function addLine() {
  if (template.value && template.value.lines.length < THUMBNAIL_MAX_LINES) template.value.lines.push(newLine(template.value.lines))
}

/** The sliders work in percent; the template in 0–1. */
const SLIDERS = [
  { key: 'x', name: 'X', what: 'across', min: 0, max: 100 },
  { key: 'y', name: 'Y', what: 'down', min: 0, max: 100 },
  { key: 'size', name: 'Size', what: 'size', min: THUMBNAIL_SIZE.min * 100, max: THUMBNAIL_SIZE.max * 100 },
] as const
const at = computed({
  get: () => pct(template.value?.at ?? 0),
  set: (v: number) => template.value && (template.value.at = v / 100),
})

// ---- the preview: the worker's drawing, again a moment after each change ----
const vodId = ref('')
const previewUrl = ref<string | null>(null)
const previewError = ref<string | null>(null)
const drawing = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let ctrl: AbortController | null = null

async function draw() {
  if (!template.value || problem.value) return
  ctrl?.abort()
  ctrl = new AbortController()
  drawing.value = true
  try {
    const blob = await admin.thumbnailPreview(template.value, vodId.value.trim() || null, ctrl.signal)
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
    previewError.value = null
  } catch (e) {
    if ((e as Error).name !== 'AbortError') previewError.value = errorText(e)
  } finally {
    drawing.value = false
  }
}
watch(
  [template, vodId],
  () => {
    clearTimeout(timer)
    timer = setTimeout(draw, 400)
  },
  { deep: true },
)

// ---- making them again for a VOD's uploads ----
const againType = ref<'vod' | 'live' | 'compiled'>('vod')
const againParts = ref('')
const againJob = ref<number | null>(null)
const againing = ref(false)
const partsError = computed(() => (/^\s*(\d+\s*(,\s*\d+\s*)*)?$/.test(againParts.value) ? null : 'Part numbers, like 1, 3'))

async function again() {
  const id = vodId.value.trim()
  if (!id || partsError.value) return
  againing.value = true
  try {
    const parts = againParts.value.split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
    const r = await admin.thumbnailsAgain(id, againType.value, parts)
    againJob.value = r.jobId ?? null
    toast.show(r.msg, { duration: 4000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    againing.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  clearTimeout(timer)
  ctrl?.abort()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <ManageShell title="Thumbnails">
    <UiCallout v-if="loadError" tone="error" title="Couldn't read the template">
      {{ loadError }} <UiButton variant="ghost" @click="load">Try again</UiButton>
    </UiCallout>
    <UiSkeleton v-else-if="!template" h="320px" />
    <template v-else>
      <p class="vods-muted intro">
        The picture each YouTube upload gets: a frame of the part with these lines over it. The worker sets it after
        every upload while its <code>youtube_thumbnail</code> setting is on, and only on a verified channel.
        <template v-if="!isSaved"> Nothing is saved yet: this is the worker's default.</template>
      </p>
      <div class="layout">
        <section class="vods-panel card preview">
          <h2 class="h">Preview</h2>
          <div class="frame" :class="{ busy: drawing }">
            <img v-if="previewUrl" :src="previewUrl" alt="The thumbnail as the worker draws it" />
            <UiSkeleton v-else h="100%" />
          </div>
          <p v-if="previewError" class="err">{{ previewError }}</p>
          <p class="vods-muted small">Fields show sample values ({part} 2, {total} 3, a few games); a VOD's own title and date when one is given.</p>
          <UiField label="Frame from VOD" help="A VOD whose file is still on the worker; empty: a plain frame.">
            <template #default="{ id }"><UiInput :id="id" v-model="vodId" placeholder="VOD id" /></template>
          </UiField>
          <div class="slide">
            <span>Frame at</span>
            <UiSlider v-model="at" :min="0" :max="100" :step="1" label="Where in the part the frame is taken" class="slider" />
            <span class="vods-muted vods-mono">{{ at }}%</span>
          </div>
        </section>

        <section class="vods-panel card">
          <h2 class="h">Lines</h2>
          <p class="vods-muted small">
            Fields: <code v-for="f in fields" :key="f" class="field">{{ '{' + f + '}' }}</code>. A line left empty by its fields (no games) isn't drawn;
            one too wide is drawn smaller.
          </p>
          <div v-for="(l, i) in template.lines" :key="i" class="line">
            <div class="row">
              <UiInput v-model="l.text" class="text" :maxlength="THUMBNAIL_TEXT_MAX" :aria-label="`Line ${i + 1} text`" />
              <UiButton variant="ghost" :aria-label="`Remove line ${i + 1}`" @click="template.lines.splice(i, 1)">Remove</UiButton>
            </div>
            <p v-if="errors[i]" class="err">{{ errors[i] }}</p>
            <div class="row">
              <UiSegmented v-model="l.align" :options="ALIGN" :label="`Line ${i + 1} alignment`" />
              <label class="colour">Text <input v-model="l.color" type="color" class="swatch" :aria-label="`Line ${i + 1} colour`" /></label>
              <UiCheckbox :model-value="l.box !== null" @update:model-value="(on: boolean) => (l.box = on ? '#000000' : null)">Box</UiCheckbox>
              <input v-if="l.box !== null" v-model="l.box" type="color" class="swatch" :aria-label="`Line ${i + 1} box colour`" />
            </div>
            <div class="sliders">
              <div v-for="s in SLIDERS" :key="s.key" class="slide">
                <span>{{ s.name }}</span>
                <UiSlider
                  :model-value="pct(l[s.key])"
                  :min="s.min"
                  :max="s.max"
                  :step="1"
                  :label="`Line ${i + 1} ${s.what}`"
                  class="slider"
                  @update:model-value="(v: number) => (l[s.key] = v / 100)"
                />
                <span class="vods-muted vods-mono">{{ pct(l[s.key]) }}%</span>
              </div>
            </div>
          </div>
          <p v-if="!template.lines.length" class="vods-muted">No lines: the frame alone.</p>
          <div class="row">
            <UiButton variant="ghost" :disabled="template.lines.length >= THUMBNAIL_MAX_LINES" @click="addLine">Add a line</UiButton>
          </div>
          <p v-if="problem" class="err">{{ problem }}</p>
          <div class="row">
            <UiButton variant="primary" :disabled="!dirty || !!problem || saving" @click="save">{{ saving ? 'Saving…' : 'Save template' }}</UiButton>
            <UiButton variant="ghost" :disabled="!dirty || saving" @click="revert">Undo changes</UiButton>
          </div>
        </section>
      </div>

      <section class="vods-panel card">
        <h2 class="h">Make them again</h2>
        <p class="vods-muted small">
          The saved template's thumbnail on a VOD's existing uploads (the VOD above), from a few seconds of each downloaded from
          YouTube. A re-upload gets its own already. 50 quota units a part.
        </p>
        <div class="row">
          <UiSegmented v-model="againType" :options="TYPES" label="Which uploads" />
          <UiField label="Parts" :error="partsError ?? undefined" help="Empty: every part.">
            <template #default="{ id }"><UiInput :id="id" v-model="againParts" placeholder="1, 3" class="parts" /></template>
          </UiField>
        </div>
        <div class="row">
          <UiButton :disabled="!vodId.trim() || !!partsError || againing || dirty" @click="again">Make thumbnails again</UiButton>
          <span v-if="dirty" class="vods-muted small">Save the template first.</span>
          <RouterLink v-if="againJob" :to="`/manage/jobs/${againJob}`">Job {{ againJob }}</RouterLink>
        </div>
      </section>
    </template>
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 12px; }
.layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
}
.card { display: grid; gap: 12px; padding: 16px; margin-bottom: 16px; min-width: 0; }
.preview { position: sticky; top: 12px; }
@media (max-width: 900px) {
  .preview { position: static; }
}
.h { margin: 0; font-size: 1.05rem; }
.frame { aspect-ratio: 16 / 9; width: 100%; border-radius: 6px; overflow: hidden; background: var(--vods-surface-2, #111); }
.frame img { display: block; width: 100%; height: 100%; object-fit: contain; }
.frame.busy img { opacity: 0.7; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.line { display: grid; gap: 8px; padding: 10px 0; border-top: 1px solid var(--vods-border, rgba(127, 127, 127, 0.25)); }
.text { flex: 1 1 220px; }
.sliders { display: grid; gap: 4px; }
.slide { display: grid; grid-template-columns: 4.5em minmax(0, 1fr) 3.5em; gap: 8px; align-items: center; }
.slider { min-width: 0; }
.colour { display: inline-flex; align-items: center; gap: 4px; }
.swatch { width: 34px; height: 30px; padding: 0; border: 0; background: none; cursor: pointer; }
.field { margin-right: 4px; }
.parts { width: 9em; }
.small { margin: 0; font-size: 0.85rem; }
.err { margin: 0; color: var(--vods-danger, #e5484d); font-size: 0.9rem; }
</style>
