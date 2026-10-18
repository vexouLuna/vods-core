<script setup lang="ts">
// /manage/tags: how each VOD tag shows on the site (GET /admin/site/tags): its label, whether it hangs off the
// thumbnail or is a chip, its color and size, and its vector shape. One Save sends the whole list, all or none;
// a shape uploads (or goes back to the placeholder) on its own, straight away, for a tag that's saved.
import { useToast } from '@vex/ui/utils'
import { timeAgo } from '../../lib/time'
import type { Option } from '@vex/ui'
import { computed, onMounted, ref } from 'vue'
import { errorText, ProblemError } from '@vex/platform-web'
import { type SiteTags } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import TagColorInput from '../../admin/TagColorInput.vue'
import { admin } from '../../admin/session'
import { blankDraft, draftsOf, previewOf, rawOf, tagChanges, type TagDraft, type TagField } from '../../admin/tags'
import TagMark from '../../components/TagMark.vue'
import { loadTagConfig, TAG_PATTERN_SIZE, TAG_SIZE, TAG_TEXT_MAX, TAG_TEXT_NUDGE, TAG_TEXT_ROTATE, TAG_TEXT_SIZE, type TagPattern } from '../../lib/vodTags'
import { site, vodsConfig } from '../../site'

const toast = useToast()
/** Where each auto tag comes from, for the admin who wonders why it's there. */
const ABOUT: Record<string, string> = {
  new: 'Set from the dates: first streamed in the last 7 days.',
  updated: 'Set from the dates: a playthrough with a new stream in the last 7 days.',
  compilation: 'On every playthrough.',
}
const SWATCHES = ['accent', 'info', 'ok', 'warn', 'bad', 'ink', 'muted'].map((t) => `var(--vods-${t})`)
const TEXT_SWATCHES = ['bg', 'ink', ...['accent', 'info', 'ok', 'warn', 'bad']].map((t) => `var(--vods-${t})`)
const PATTERNS: Option<TagPattern | ''>[] = [
  { value: '', label: 'Plain' },
  { value: 'stripes', label: 'Stripes' },
  { value: 'checks', label: 'Checks' },
]
const MAX_SVG = 64 * 1024

const data = ref<SiteTags | null>(null)
const loadError = ref<string | null>(null)
/** The archive has no site tags yet (404): the built-in ones show, and nothing can be saved. */
const unavailable = ref(false)
const drafts = ref<TagDraft[]>([])
const saving = ref(false)
const saveError = ref<string | null>(null)
/** The tag whose shape is uploading or being removed. */
const shaping = ref<string | null>(null)

function take(d: SiteTags) {
  data.value = d
  drafts.value = draftsOf(d.tags)
}
async function load() {
  loadError.value = null
  unavailable.value = false
  try {
    take(await admin.siteTags())
  } catch (e) {
    if (e instanceof ProblemError && e.status === 404) {
      unavailable.value = true
      take({ tags: rawOf(site.tags), updatedAt: null, updatedBy: null })
    } else loadError.value = errorText(e)
  }
}

const pending = computed(() => tagChanges(data.value?.tags ?? [], drafts.value))
const err = (d: TagDraft, field: TagField) => pending.value.errors.get(d.key)?.[field]

async function save() {
  if (unavailable.value || !pending.value.changed || pending.value.errors.size) return
  saving.value = true
  saveError.value = null
  try {
    take(await admin.saveSiteTags(pending.value.body))
    void loadTagConfig()
    toast.show('Tags saved', { duration: 3000 })
  } catch (e) {
    saveError.value = errorText(e)
  } finally {
    saving.value = false
  }
}
function undo() {
  if (data.value) take(data.value)
  saveError.value = null
}
const add = () => drafts.value.push(blankDraft())
function remove(d: TagDraft) {
  if (!d.auto) drafts.value = drafts.value.filter((x) => x.key !== d.key)
}
function move(d: TagDraft, by: -1 | 1) {
  const list = [...drafts.value]
  const i = list.indexOf(d)
  const j = i + by
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  drafts.value = list
}

/** A shape changed: only that tag's shape, so unsaved edits elsewhere stay. */
function takeShape(d: TagDraft, fresh: SiteTags) {
  const shape = fresh.tags.find((t) => t.name === d.name)?.shape ?? null
  d.shape = shape
  if (data.value) {
    data.value = { ...data.value, tags: data.value.tags.map((t) => (t.name === d.name ? { ...t, shape } : t)), updatedAt: fresh.updatedAt, updatedBy: fresh.updatedBy }
  }
  void loadTagConfig()
}
async function upload(d: TagDraft, ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > MAX_SVG) return toast.show(`${file.name} is over 64 KB`, { kind: 'error', duration: 5000 })
  shaping.value = d.name
  try {
    takeShape(d, await admin.uploadTagShape(d.name, file.type ? file : new Blob([file], { type: 'image/svg+xml' })))
    toast.show(`New shape for ${d.label || d.name}`, { duration: 3000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  } finally {
    shaping.value = null
  }
}
async function dropShape(d: TagDraft) {
  shaping.value = d.name
  try {
    takeShape(d, await admin.deleteTagShape(d.name))
    toast.show(`${d.label || d.name} is a placeholder again`, { duration: 3000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  } finally {
    shaping.value = null
  }
}

onMounted(() => {
  document.title = `Tags · Manage · ${site.name}`
  void load()
})
</script>

<template>
  <ManageShell title="Tags">
    <p class="intro vods-muted">
      How each VOD tag shows on the site. A drawn tag hangs off the thumbnail, in its color, as its SVG shape or a
      placeholder until it has one; the rest are chips by the date. A tag not listed here is a chip with its own name.
    </p>

    <UiCallout v-if="loadError" tone="error" title="Couldn't load the tags">
      {{ loadError }}
      <template #actions><UiButton size="sm" @click="load">Try again</UiButton></template>
    </UiCallout>
    <div v-else-if="!data" class="sk" aria-busy="true"><UiSkeleton v-for="i in 3" :key="i" h="150px" /></div>

    <form v-else @submit.prevent="save">
      <UiCallout v-if="unavailable" tone="warn" title="The archive doesn't keep tags yet" class="gap">
        These are the site's built-in tags (the site's createVodsApp() options). Saving needs the archive's site tags endpoints
        (docs/admin-api.md, "Site tags").
      </UiCallout>
      <p v-else-if="data.updatedAt" class="when vods-muted">
        Last changed {{ timeAgo(data.updatedAt) }}<template v-if="data.updatedBy"> by {{ data.updatedBy }}</template>
      </p>

      <section v-for="(d, i) in drafts" :key="d.key" class="tag vods-panel" :aria-label="d.name || 'New tag'">
        <div class="preview" aria-hidden="true">
          <div class="thumb"><TagMark v-if="d.drawn" class="mark" :tag="previewOf(d, vodsConfig.apiBase)" /></div>
          <UiChip
            v-if="!d.drawn"
            class="chip"
            :style="previewOf(d, vodsConfig.apiBase).color ? { color: d.color, borderColor: d.color } : undefined"
          >{{ d.label || d.name || 'tag' }}</UiChip>
        </div>

        <div class="fields">
          <UiField label="Name" :error="err(d, 'name')" :help="d.auto ? ABOUT[d.name] : d.saved ? undefined : 'Can\'t change once saved.'">
            <template #default="{ id }"><UiInput :id="id" v-model="d.name" mono :disabled="d.saved || d.auto" :invalid="!!err(d, 'name')" placeholder="speedrun" /></template>
          </UiField>
          <UiField label="Label" :error="err(d, 'label')" help="On its chip, or read out when drawn.">
            <template #default="{ id }"><UiInput :id="id" v-model="d.label" :invalid="!!err(d, 'label')" /></template>
          </UiField>
          <UiField label="Color" :error="err(d, 'color')" help="Empty: the default look.">
            <template #default="{ id }">
              <TagColorInput :id="id" v-model="d.color" :swatches="SWATCHES" :invalid="!!err(d, 'color')" placeholder="var(--vods-accent)" :pick-label="`Pick a color for ${d.name || 'the tag'}`" />
            </template>
          </UiField>
          <div class="drawn">
            <UiSwitch v-model="d.drawn" :label="'Drawn on the thumbnail'" />
          </div>
          <template v-if="d.drawn">
            <UiField label="Width" :error="err(d, 'width')" :help="`px, ${TAG_SIZE.min}–${TAG_SIZE.max}; empty: 62`">
              <template #default="{ id }"><UiInput :id="id" v-model="d.width" type="number" mono :invalid="!!err(d, 'width')" placeholder="62" /></template>
            </UiField>
            <UiField label="Height" :error="err(d, 'height')" :help="`px; empty: 22`">
              <template #default="{ id }"><UiInput :id="id" v-model="d.height" type="number" mono :invalid="!!err(d, 'height')" placeholder="22" /></template>
            </UiField>
            <div class="shape">
              <span class="vods-eyebrow">Shape</span>
              <span class="vods-muted">{{ d.shape ? 'SVG: its currentColor parts (or black, if none) take the color' : 'Placeholder' }}</span>
              <template v-if="d.saved && !unavailable">
                <label class="vods-btn is-sm upload" :class="{ 'is-busy': shaping === d.name }">
                  {{ d.shape ? 'Replace SVG' : 'Upload SVG' }}
                  <input type="file" accept=".svg,image/svg+xml" class="file" :disabled="shaping === d.name" @change="upload(d, $event)" />
                </label>
                <UiButton v-if="d.shape" size="sm" variant="ghost" :loading="shaping === d.name" @click="dropShape(d)">Use the placeholder</UiButton>
              </template>
              <span v-else-if="!unavailable" class="vods-muted note">Save the tag first.</span>
            </div>
            <UiField label="Pattern" help="Over the parts in the tag's color.">
              <template #default="{ id }">
                <UiSelect :id="id" :model-value="d.pattern" :options="PATTERNS" width="100%" @update:model-value="d.pattern = $event ?? ''" />
              </template>
            </UiField>
            <template v-if="d.pattern">
              <UiField label="Pattern color" :error="err(d, 'patternColor')" help="Empty: the page background.">
                <template #default="{ id }">
                  <TagColorInput :id="id" v-model="d.patternColor" :swatches="TEXT_SWATCHES" :invalid="!!err(d, 'patternColor')" placeholder="var(--vods-bg)" :pick-label="`Pick a pattern color for ${d.name || 'the tag'}`" />
                </template>
              </UiField>
              <UiField label="Pattern size" :error="err(d, 'patternSize')" :help="`px per stripe or square, ${TAG_PATTERN_SIZE.min}–${TAG_PATTERN_SIZE.max}; empty: 4`">
                <template #default="{ id }"><UiInput :id="id" v-model="d.patternSize" type="number" mono :invalid="!!err(d, 'patternSize')" placeholder="4" /></template>
              </UiField>
            </template>
            <div class="drawn wide">
              <UiSwitch v-model="d.textOn" :label="'Text on the tag'" />
            </div>
            <template v-if="d.textOn">
              <UiField label="Text" :error="err(d, 'text')" :help="`Up to ${TAG_TEXT_MAX}; the label stays as it is.`">
                <template #default="{ id }"><UiInput :id="id" v-model="d.text" :invalid="!!err(d, 'text')" :placeholder="d.label" /></template>
              </UiField>
              <UiField label="Text color" :error="err(d, 'textColor')" help="Empty: the page background.">
                <template #default="{ id }">
                  <TagColorInput :id="id" v-model="d.textColor" :swatches="TEXT_SWATCHES" :invalid="!!err(d, 'textColor')" placeholder="var(--vods-bg)" :pick-label="`Pick a text color for ${d.name || 'the tag'}`" />
                </template>
              </UiField>
              <UiField label="Text size" :error="err(d, 'textSize')" :help="`px, ${TAG_TEXT_SIZE.min}–${TAG_TEXT_SIZE.max}; empty: half the height`">
                <template #default="{ id }"><UiInput :id="id" v-model="d.textSize" type="number" mono :invalid="!!err(d, 'textSize')" /></template>
              </UiField>
              <UiField label="Nudge across" :error="err(d, 'textX')" :help="`px from the middle, ${TAG_TEXT_NUDGE.min} to ${TAG_TEXT_NUDGE.max}; + is right`">
                <template #default="{ id }"><UiInput :id="id" v-model="d.textX" type="number" mono :invalid="!!err(d, 'textX')" placeholder="0" /></template>
              </UiField>
              <UiField label="Nudge down" :error="err(d, 'textY')" help="px from the middle; + is down">
                <template #default="{ id }"><UiInput :id="id" v-model="d.textY" type="number" mono :invalid="!!err(d, 'textY')" placeholder="0" /></template>
              </UiField>
              <UiField label="Rotate" :error="err(d, 'textRotate')" :help="`degrees, ${TAG_TEXT_ROTATE.min} to ${TAG_TEXT_ROTATE.max}; + is clockwise`">
                <template #default="{ id }"><UiInput :id="id" v-model="d.textRotate" type="number" mono :invalid="!!err(d, 'textRotate')" placeholder="0" /></template>
              </UiField>
            </template>
          </template>
        </div>

        <div class="row-actions">
          <UiButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move ${d.name || 'tag'} up`" @click="move(d, -1)">↑</UiButton>
          <UiButton size="sm" variant="ghost" :disabled="i === drafts.length - 1" :aria-label="`Move ${d.name || 'tag'} down`" @click="move(d, 1)">↓</UiButton>
          <span v-if="d.auto" class="auto" title="Set automatically; can't be removed">AUTO</span>
          <UiButton v-else size="sm" variant="ghost" @click="remove(d)">Remove</UiButton>
        </div>
      </section>

      <UiButton class="add" @click="add">+ Add a tag</UiButton>

      <div class="savebar vods-panel" :class="{ 'is-on': pending.changed || saveError }">
        <UiCallout v-if="saveError" tone="error" title="Nothing was saved" class="save-err">{{ saveError }}</UiCallout>
        <span class="vods-muted">{{ pending.changed ? 'Unsaved changes' : 'No changes' }}</span>
        <span class="spacer" />
        <UiButton :disabled="!pending.changed || saving" @click="undo">Undo changes</UiButton>
        <UiButton type="submit" variant="primary" :loading="saving" :disabled="unavailable || !pending.changed || pending.errors.size > 0">Save</UiButton>
      </div>
    </form>
  </ManageShell>
</template>

<style scoped>
.intro { margin: -8px 0 16px; max-width: 70ch; font-size: 13px; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.gap { margin-bottom: 16px; }
.when { margin: -8px 0 12px; font-size: 12px; }
.tag {
  display: grid; grid-template-columns: 170px minmax(0, 1fr) auto; gap: 12px 18px; padding: 14px 16px; margin-bottom: 12px;
  align-items: start;
}
.preview { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.thumb {
  position: relative; width: 160px; aspect-ratio: 16 / 9; border-radius: var(--vods-radius-sm);
  background: linear-gradient(135deg, var(--vods-surface-2), var(--vods-surface)); box-shadow: inset 0 0 0 1px var(--vods-line);
}
.mark { position: absolute; left: -5px; top: 16px; }
.fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 14px; min-width: 0; }
.drawn { display: flex; align-items: center; }
.wide { grid-column: 1 / -1; }
.shape { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13px; }
.upload { position: relative; cursor: pointer; }
.upload.is-busy { opacity: 0.6; pointer-events: none; }
.file { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.upload:focus-within { outline: 2px solid var(--vods-ring, var(--vods-accent)); outline-offset: 2px; }
.note { font-size: 12px; }
.row-actions { display: flex; align-items: center; gap: 4px; }
.auto {
  margin-left: 4px; padding: 4px 6px; border: 1px solid currentColor; border-radius: 4px;
  font: 600 10px/1 var(--vods-font-mono); letter-spacing: .08em; color: var(--vods-info);
}
.add { margin-bottom: 16px; }
.savebar {
  position: sticky; bottom: 12px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 14px; background: var(--vods-bg);
}
.savebar.is-on { box-shadow: 0 0 0 1px var(--vods-accent); }
.save-err { flex-basis: 100%; }
.spacer { flex: 1; }
@container vods (max-width: 760px) {
  .tag { grid-template-columns: minmax(0, 1fr); }
  .row-actions { justify-content: flex-end; }
}
</style>
