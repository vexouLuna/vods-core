<script setup lang="ts">
// The censor song library: the songs a range's "Song" sound loops over what it mutes. Upload (any audio file; the
// worker keeps it only if it reads as audio, re-encoded), listen, delete (refused while a range plays it).
import { errorText } from '@vex/platform-web'
import { useToast } from '@vex/ui/utils'
import { ref } from 'vue'
import { toClock } from '../../index'
import type { CensorSong } from './api'
import { admin } from './session'

const props = defineProps<{ songs: CensorSong[] }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const SONG_MAX = 25 * 1024 * 1024
const name = ref('')
const busy = ref(false)
const playing = ref<string | null>(null)

async function upload(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > SONG_MAX) return toast.show(`${file.name} is over 25 MB`, { kind: 'error', duration: 5000 })
  const label = name.value.trim() || file.name.replace(/\.[^.]+$/, '')
  busy.value = true
  try {
    const song = await admin.addSong(label, file)
    toast.show(`Added ${song.name} (${toClock(song.duration_seconds)})`, { duration: 3000 })
    name.value = ''
    emit('changed')
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    busy.value = false
  }
}

async function remove(s: CensorSong) {
  busy.value = true
  try {
    await admin.deleteSong(s.id)
    toast.show(`Deleted ${s.name}`, { duration: 3000 })
    emit('changed')
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <details class="songs">
    <summary>Song library ({{ props.songs.length }})</summary>
    <p class="vods-muted note">
      A range set to <b>Song</b> silences the stream there and loops one of these over it. MP3, M4A, OGG, WAV, FLAC up
      to 25 MB; kept up to 10 minutes. A song a range plays can't be deleted.
    </p>
    <ul v-if="props.songs.length" class="list">
      <li v-for="s in props.songs" :key="s.id" class="song">
        <span class="name">{{ s.name }}</span>
        <span class="vods-muted">{{ toClock(s.duration_seconds) }}</span>
        <audio v-if="playing === s.id" :src="admin.songUrl(s.id)" controls autoplay class="player"></audio>
        <UiButton v-else size="sm" variant="ghost" @click="playing = s.id">Listen</UiButton>
        <UiButton size="sm" variant="ghost" :disabled="busy" :label="`Delete ${s.name}`" @click="remove(s)">Delete</UiButton>
      </li>
    </ul>
    <p v-else class="vods-muted note">No songs yet.</p>
    <div class="add">
      <UiInput v-model="name" placeholder="Name (optional: the file's)" aria-label="New song name" class="grow" :maxlength="80" />
      <label class="pick">
        <UiButton size="sm" :disabled="busy" tabindex="-1">{{ busy ? 'Working…' : 'Upload a song' }}</UiButton>
        <input type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.flac" class="file" :disabled="busy" aria-label="Upload a song" @change="upload" />
      </label>
    </div>
  </details>
</template>

<style scoped>
.songs { border-top: 1px solid var(--vods-line); padding-top: 8px; }
.songs summary { cursor: pointer; font-weight: 600; }
.note { margin: 6px 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.song { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.name { flex: 1 1 140px; overflow-wrap: anywhere; }
.player { height: 32px; max-width: 100%; }
.add { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
.grow { flex: 1 1 200px; }
.pick { position: relative; display: inline-flex; }
.file { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
</style>
