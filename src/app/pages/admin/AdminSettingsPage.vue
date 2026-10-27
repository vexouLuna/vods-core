<script setup lang="ts">
// /manage/settings: the worker settings the dashboard can override (GET /admin/settings), grouped as the worker groups
// them. Each shows its env default and when a change is seen; one Save sends every change, all or none. Above them, the
// "Watch page" group edits the site's own playDefault (GET/PUT /admin/site/options), with its own Save.
import { useToast } from '@vex/ui/utils'
import { timeAgo } from '../../lib/time'
import { computed, onMounted, ref } from 'vue'
import { errorText } from '@vex/platform-web'
import type { RuntimeSetting } from '../../admin/api'
import GameListInput from '../../admin/GameListInput.vue'
import ManageShell from '../../admin/ManageShell.vue'
import { admin } from '../../admin/session'
import { settingChanges, settingLabel, showValue, toDraft, type SettingDraft } from '../../admin/settings'
import { siteOptions, type PlayDefault } from '../../lib/siteOptions'
import { site } from '../../site'

const toast = useToast()
const GROUPS = ['Capture', 'YouTube', 'Pipeline', 'Runner']
// The list settings that hold game names (they get the Twitch category search); the other lists stay free tags.
const GAME_LISTS = ['restricted_games', 'censor_allow_games']

const items = ref<RuntimeSetting[] | null>(null)
const loadError = ref<string | null>(null)
const drafts = ref<Record<string, SettingDraft>>({})
const saving = ref(false)
const saveError = ref<string | null>(null)
const resetting = ref<string | null>(null)

function take(data: RuntimeSetting[]) {
  items.value = data
  drafts.value = Object.fromEntries(data.map((s) => [s.key, toDraft(s)]))
}
async function load() {
  loadError.value = null
  try {
    take((await admin.settings()).items)
  } catch (e) {
    loadError.value = errorText(e)
  }
}

const groups = computed(() => {
  const all = items.value ?? []
  const names = [...GROUPS, ...new Set(all.map((s) => s.group).filter((g) => !GROUPS.includes(g)))]
  return names.map((name) => ({ name, items: all.filter((s) => s.group === name) })).filter((g) => g.items.length)
})
const pending = computed(() => settingChanges(items.value ?? [], drafts.value))
const count = computed(() => Object.keys(pending.value.changes).length)
const changed = (key: string) => key in pending.value.changes

async function save() {
  if (!count.value || pending.value.errors.size) return
  saving.value = true
  saveError.value = null
  try {
    take((await admin.saveSettings(pending.value.changes)).items)
    toast.show(count.value === 1 ? 'Setting saved' : 'Settings saved', { duration: 3000 })
  } catch (e) {
    saveError.value = errorText(e)
  } finally {
    saving.value = false
  }
}
function undo() {
  if (items.value) take(items.value)
  saveError.value = null
}
/** Back to the env default: drops the override (and this setting's unsaved draft; the others stay). */
async function reset(s: RuntimeSetting) {
  resetting.value = s.key
  try {
    const keep = { ...drafts.value }
    const data = (await admin.resetSetting(s.key)).items
    items.value = data
    const fresh = data.find((x) => x.key === s.key)!
    drafts.value = { ...keep, [s.key]: toDraft(fresh) }
    toast.show(`${settingLabel(s.key)} is back to its default`, { duration: 3000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  } finally {
    resetting.value = null
  }
}

// Manual steps: which steps each job kind pauses before.
function steps(s: RuntimeSetting): Record<string, string[]> {
  return drafts.value[s.key] as Record<string, string[]>
}
function toggleStep(s: RuntimeSetting, kind: string, step: string) {
  const d = steps(s)
  const have = d[kind] ?? []
  d[kind] = have.includes(step) ? have.filter((x) => x !== step) : [...have, step]
}

// ── Watch page: which version of a compiled synthetic VOD plays first (the site's options, not the worker's) ──
const play = ref<PlayDefault | null>(null)
const playSaved = ref<PlayDefault | null>(null)
const playError = ref<string | null>(null)
const playSaving = ref(false)
async function loadPlay() {
  playError.value = null
  try {
    playSaved.value = play.value = (await admin.siteOptions()).playDefault
  } catch (e) {
    playError.value = errorText(e)
  }
}
async function savePlay() {
  if (!play.value) return
  playSaving.value = true
  playError.value = null
  try {
    playSaved.value = play.value = (await admin.saveSiteOptions({ playDefault: play.value })).playDefault
    siteOptions.value = { ...siteOptions.value, playDefault: playSaved.value }
    toast.show('Watch page saved', { duration: 3000 })
  } catch (e) {
    playError.value = errorText(e)
  } finally {
    playSaving.value = false
  }
}

onMounted(() => {
  document.title = `Settings · Manage · ${site.name}`
  void load()
  void loadPlay()
})
</script>

<template>
  <ManageShell title="Settings">
    <p class="intro vods-muted">
      The worker's settings you can change while it runs. Each starts from the worker's environment (its default here);
      a change here overrides it until you reset it.
    </p>

    <form class="group vods-panel vx-glass-rim" @submit.prevent="savePlay">
      <h2 class="vods-eyebrow">Watch page</h2>
      <div class="setting" :class="{ 'is-changed': play !== playSaved }">
        <div class="about">
          <label class="name" for="set-play-default">A synthetic VOD with a compiled upload plays</label>
          <p class="help vods-muted">What its watch page starts with; the page's switcher plays the other.</p>
        </div>
        <div class="control">
          <select id="set-play-default" v-model="play" class="vods-input" :disabled="!playSaved">
            <option value="segments">its segments (each source's own uploads)</option>
            <option value="compiled">its compiled upload</option>
          </select>
          <p v-if="playError" class="err">{{ playError }}</p>
          <span class="play-acts">
            <UiButton size="sm" variant="ghost" :disabled="play === playSaved" @click="play = playSaved">Undo</UiButton>
            <UiButton size="sm" type="submit" variant="primary" :loading="playSaving" :disabled="!play || play === playSaved">Save</UiButton>
          </span>
        </div>
      </div>
    </form>

    <UiLoadState
      :error="loadError"
      :loading="!items"
      error-title="Couldn't load the settings"
      :rows="3"
      row-height="160px"
      @retry="load"
    >
      <form @submit.prevent="save">
        <section v-for="g in groups" :key="g.name" class="group vods-panel vx-glass-rim">
          <h2 class="vods-eyebrow">{{ g.name }}</h2>
          <div v-for="s in g.items" :key="s.key" class="setting" :class="{ 'is-changed': changed(s.key), 'has-error': pending.errors.has(s.key) }">
            <div class="about">
              <label class="name" :for="`set-${s.key}`">{{ settingLabel(s.key) }}</label>
              <UiChip :tone="s.applies === 'now' ? 'accent' : 'default'" :title="s.applies === 'now' ? 'Seen at the next check, pick or step' : 'Jobs read it when they start or resume'">
                {{ s.applies === 'now' ? 'applies now' : 'applies to the next job' }}
              </UiChip>
              <UiChip v-if="s.overridden" tone="warn" :title="s.updated_at ? `Changed ${timeAgo(s.updated_at)}${s.updated_by ? ` by ${s.updated_by}` : ''}` : undefined">overridden</UiChip>
              <p class="help vods-muted">{{ s.help }}</p>
              <p class="default vods-muted">
                Default: <span class="vods-mono">{{ showValue(s, s.default) }}</span>
                <template v-if="s.min != null || s.max != null"> · range {{ s.min ?? '…' }}–{{ s.max ?? '…' }}</template>
              </p>
            </div>

            <div class="control">
              <UiSwitch v-if="s.type === 'bool'" :id="`set-${s.key}`" v-model="(drafts[s.key] as boolean)" />
              <UiInput
                v-else-if="s.type === 'int' || s.type === 'float'"
                :id="`set-${s.key}`"
                v-model="(drafts[s.key] as string)"
                class="num"
                type="number"
                mono
                :invalid="pending.errors.has(s.key)"
              />
              <GameListInput
                v-else-if="s.type === 'list' && GAME_LISTS.includes(s.key)"
                v-model="(drafts[s.key] as string[])"
                class="list"
                :label="settingLabel(s.key)"
              />
              <UiTagInput
                v-else-if="s.type === 'list'"
                :id="`set-${s.key}`"
                v-model="(drafts[s.key] as string[])"
                class="list"
                allow-new
                placeholder="add one…"
              />
              <div v-else-if="s.type === 'steps'" :id="`set-${s.key}`" class="kinds" role="group" :aria-label="settingLabel(s.key)">
                <div v-for="(all, kind) in s.choices ?? {}" :key="kind" class="kind">
                  <span class="kind-name vods-mono">{{ kind }}</span>
                  <div class="steps">
                    <button
                      v-for="step in all"
                      :key="step"
                      type="button"
                      class="step"
                      :aria-pressed="steps(s)[kind]?.includes(step) ?? false"
                      :title="`${kind} jobs pause before ${step}`"
                      @click="toggleStep(s, String(kind), step)"
                    >{{ step }}</button>
                  </div>
                </div>
              </div>
              <UiInput v-else :id="`set-${s.key}`" v-model="(drafts[s.key] as string)" class="text" :invalid="pending.errors.has(s.key)" />
              <p v-if="pending.errors.has(s.key)" class="err">{{ pending.errors.get(s.key) }}</p>
              <UiButton v-if="s.overridden" size="sm" variant="ghost" :loading="resetting === s.key" @click="reset(s)">Reset to default</UiButton>
            </div>
          </div>
        </section>

        <UiSaveBar :count="count" :saving="saving" :blocked="pending.errors.size > 0" :error="saveError" submit @undo="undo" />
      </form>
    </UiLoadState>
  </ManageShell>
</template>

<style scoped>
.intro { margin: -8px 0 16px; max-width: 70ch; font-size: 13px; }
.group { padding: 14px 16px; margin-bottom: 16px; }
h2 { margin: 0 0 4px; }
.setting {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 8px 20px; padding: 12px 0;
  border-top: 1px solid var(--vods-line);
}
.setting:first-of-type { border-top: 0; }
.setting.is-changed .name::after { content: ' •'; color: var(--vods-accent); }
.about { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; align-content: flex-start; }
.name { font-weight: 600; cursor: pointer; }
.help, .default { flex-basis: 100%; margin: 0; font-size: 12px; }
.control { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.num { width: 160px; }
.text { width: 100%; }
.list { width: 100%; }
.kinds { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.kind { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; align-items: baseline; }
.kind-name { font-size: 12px; overflow-wrap: anywhere; }
.steps { display: flex; flex-wrap: wrap; gap: 4px; }
.step {
  font: inherit; font-size: 11px; padding: 2px 8px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--vods-line); background: transparent; color: var(--vods-muted);
}
.step:hover { color: var(--vods-ink); }
.step[aria-pressed='true'] { border-color: var(--vods-warn, var(--vods-accent)); color: var(--vods-ink); background: var(--vods-hover); }
.err { margin: 0; color: var(--vods-bad); font-size: 12px; }
.play-acts { display: flex; gap: 6px; }
@container vods (max-width: 760px) {
  .setting { grid-template-columns: minmax(0, 1fr); }
  .kind { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
</style>
