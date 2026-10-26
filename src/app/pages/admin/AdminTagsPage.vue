<script setup lang="ts">
// /manage/tags: how each VOD tag shows on the site (GET /admin/site/tags): its label, whether it hangs off the
// thumbnail or is a chip, its color and size, and its vector shape. One Save sends the whole list, all or none;
// a shape uploads (or goes back to the placeholder) on its own, straight away, for a tag that's saved. Each tag is a row
// that opens to its form (several can be open); a row with unsaved changes has a dot, and Save opens the rows with errors.
import { useToast } from '@vex/ui/utils'
import { timeAgo } from '../../lib/time'
import type { Option } from '@vex/ui'
import { computed, onMounted, ref } from 'vue'
import { errorText, ProblemError } from '@vex/platform-web'
import { type SiteTags } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import TagColorInput from '../../admin/TagColorInput.vue'
import { admin } from '../../admin/session'
import { blankDraft, draftsOf, homeCategory, previewOf, rawOf, tagChanges, type TagDraft, type TagField } from '../../admin/tags'
import TagMark from '../../components/TagMark.vue'
import { loadTagConfig, TAG_PATTERN_SIZE, TAG_SIZE, TAG_TEXT_MAX, TAG_TEXT_NUDGE, TAG_TEXT_ROTATE, TAG_TEXT_SIZE, TAG_ROTATE, type TagPattern } from '../../lib/vodTags'
import { site, vodsConfig } from '../../site'
import { moved } from '../../lib/reorder'

const toast = useToast()
/** Where each auto tag comes from, for the admin who wonders why it's there. */
const ABOUT: Record<string, string> = {
  new: 'Set from the dates: first streamed in the last 7 days.',
  updated: 'Set from the dates: a playthrough with a new stream in the last 7 days.',
  compilation: 'Set by the archive on a synthetic VOD that keeps itself up to date.',
  vods: 'Set by the archive on every VOD and each merge or split: what /vods lists.',
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

// ── which rows are open: new tags start open, and Save opens the ones with errors ──
const open = ref(new Set<number>())
const isOpen = (d: TagDraft) => open.value.has(d.key)
function toggle(d: TagDraft) {
  const next = new Set(open.value)
  if (!next.delete(d.key)) next.add(d.key)
  open.value = next
}
const allOpen = computed(() => drafts.value.every(isOpen))
const setAll = (on: boolean) => (open.value = new Set(on ? drafts.value.map((d) => d.key) : []))

async function save() {
  if (pending.value.errors.size) open.value = new Set([...open.value, ...pending.value.errors.keys()])
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
function add() {
  const d = blankDraft()
  drafts.value.push(d)
  open.value = new Set([...open.value, d.key])
}
function remove(d: TagDraft) {
  if (!d.auto) drafts.value = drafts.value.filter((x) => x.key !== d.key)
}
const move = (d: TagDraft, by: -1 | 1) => (drafts.value = moved(drafts.value, drafts.value.indexOf(d), by))

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

    <UiLoadState
      :error="loadError"
      :loading="!data"
      error-title="Couldn't load the tags"
      :rows="3"
      row-height="150px"
      @retry="load"
    >
      <template v-if="data">
        <form @submit.prevent="save">
          <UiCallout v-if="unavailable" tone="warn" title="The archive doesn't keep tags yet" class="gap">
            These are the site's built-in tags (the site's createVodsApp() options). Saving needs the archive's site tags endpoints
            (docs/admin-api.md, "Site tags").
          </UiCallout>
          <p v-else-if="data.updatedAt" class="when vods-muted">
            Last changed {{ timeAgo(data.updatedAt) }}<template v-if="data.updatedBy"> by {{ data.updatedBy }}</template>
          </p>

          <div class="bulk">
            <UiButton size="sm" variant="ghost" :disabled="!drafts.length" @click="setAll(!allOpen)">{{ allOpen ? 'Collapse all' : 'Expand all' }}</UiButton>
          </div>
          <section v-for="(d, i) in drafts" :key="d.key" class="tag vods-panel vx-glass-rim" :class="{ 'is-open': isOpen(d), 'has-error': pending.errors.has(d.key) }" :aria-label="d.name || 'New tag'">
            <div class="head">
              <button
                type="button"
                class="toggle"
                :aria-expanded="isOpen(d)"
                :aria-controls="`tag-body-${d.key}`"
                @click="toggle(d)"
              >
                <span class="mini" aria-hidden="true">
                  <TagMark v-if="d.drawn" class="mini-mark" :tag="previewOf(d, vodsConfig.apiBase)" />
                  <UiChip v-else :style="previewOf(d, vodsConfig.apiBase).color ? { color: d.color, borderColor: d.color } : undefined">{{ d.label || d.name || 'tag' }}</UiChip>
                </span>
                <span class="who">
                  <strong class="vods-mono">{{ d.name || 'new tag' }}</strong>
                  <span v-if="pending.dirty.has(d.key)" class="dot" title="Unsaved changes"><span class="sr">(unsaved)</span></span>
                  <span class="vods-muted"> · {{ d.label || '—' }}</span>
                </span>
                <span class="badges">
                  <UiChip v-if="d.page.trim()">page /{{ d.page.trim() }}</UiChip>
                  <UiChip v-if="d.drawn">drawn</UiChip>
                  <UiChip v-if="d.auto" tone="accent" :title="ABOUT[d.name]">automatic</UiChip>
                  <UiChip v-if="pending.errors.has(d.key)" tone="bad">fix</UiChip>
                </span>
                <span class="chev" aria-hidden="true">{{ isOpen(d) ? '▾' : '▸' }}</span>
              </button>
              <span class="row-actions">
                <UiButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move ${d.name || 'tag'} up`" @click="move(d, -1)">↑</UiButton>
                <UiButton size="sm" variant="ghost" :disabled="i === drafts.length - 1" :aria-label="`Move ${d.name || 'tag'} down`" @click="move(d, 1)">↓</UiButton>
              </span>
            </div>

            <div v-if="isOpen(d)" :id="`tag-body-${d.key}`" class="body">
              <div class="preview" aria-hidden="true">
                <div class="thumb"><TagMark v-if="d.drawn" class="mark" :tag="previewOf(d, vodsConfig.apiBase)" /></div>
                <UiChip
                  v-if="!d.drawn"
                  class="chip"
                  :style="previewOf(d, vodsConfig.apiBase).color ? { color: d.color, borderColor: d.color } : undefined"
                >{{ d.label || d.name || 'tag' }}</UiChip>
                <span v-if="d.auto" class="auto" title="Set automatically; can't be removed">AUTO</span>
                <UiButton v-else size="sm" variant="ghost" @click="remove(d)">Remove</UiButton>
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
                  <UiSwitch :model-value="!!d.page.trim()" :label="'Home category'" @update:model-value="homeCategory(d, $event)" />
                </div>
                <template v-if="d.page.trim()">
                  <UiField label="Page" :error="err(d, 'page')" help="Its list page and header link; it can also be a home card (Homepage).">
                    <template #default="{ id }"><UiInput :id="id" v-model="d.page" mono :invalid="!!err(d, 'page')" placeholder="highlights" /></template>
                  </UiField>
                  <UiField label="Page title" :error="err(d, 'pageLabel')" help="The page's heading and header link.">
                    <template #default="{ id }"><UiInput :id="id" v-model="d.pageLabel" :invalid="!!err(d, 'pageLabel')" placeholder="Highlights" /></template>
                  </UiField>
                </template>
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
                  <UiField label="Tag rotate" :error="err(d, 'rotate')" :help="`degrees, ${TAG_ROTATE.min} to ${TAG_ROTATE.max}; + is clockwise; empty: -4`">
                    <template #default="{ id }"><UiInput :id="id" v-model="d.rotate" type="number" mono :invalid="!!err(d, 'rotate')" placeholder="-4" /></template>
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

            </div>
          </section>

          <UiButton class="add" @click="add">+ Add a tag</UiButton>

          <UiSaveBar :count="pending.count" :saving="saving" :blocked="unavailable || pending.errors.size > 0" :error="saveError" submit @undo="undo" />
        </form>
      </template>
    </UiLoadState>
  </ManageShell>
</template>

<style scoped>
.intro { margin: -8px 0 16px; max-width: 70ch; font-size: 13px; }
.gap { margin-bottom: 16px; }
.when { margin: -8px 0 12px; font-size: 12px; }
.bulk { display: flex; justify-content: flex-end; margin-bottom: 6px; }
.tag { padding: 6px 10px; margin-bottom: 8px; }
.tag.has-error { box-shadow: inset 3px 0 0 var(--vods-bad); }
.head { display: flex; align-items: center; gap: 6px; }
.toggle {
  flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 4px;
  font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: var(--vods-radius-sm); cursor: pointer;
}
.toggle:hover { background: var(--vods-hover); }
.toggle:focus-visible { outline: 2px solid var(--vods-ring, var(--vods-accent)); outline-offset: 1px; }
.mini { position: relative; width: 70px; height: 26px; flex: none; display: flex; align-items: center; }
.mini-mark { position: absolute; left: 0; top: 2px; }
.who { min-width: 0; overflow-wrap: anywhere; }
.dot { display: inline-block; width: 7px; height: 7px; margin-left: 6px; border-radius: 50%; background: var(--vods-warn); vertical-align: middle; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.badges { display: flex; flex-wrap: wrap; gap: 4px; }
.chev { margin-left: auto; opacity: 0.7; }
.body {
  display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px 18px; padding: 12px 4px 8px;
  border-top: 1px solid var(--vods-line); margin-top: 6px; align-items: start;
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
.row-actions { display: flex; align-items: center; gap: 2px; flex: none; }
.auto {
  margin-left: 4px; padding: 4px 6px; border: 1px solid currentColor; border-radius: 4px;
  font: 600 10px/1 var(--vods-font-mono); letter-spacing: .08em; color: var(--vods-info);
}
.add { margin-bottom: 16px; }
@container vods (max-width: 760px) {
  .body { grid-template-columns: minmax(0, 1fr); }
}
</style>
