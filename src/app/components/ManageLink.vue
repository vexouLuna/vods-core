<script setup lang="ts">
// The header's way into Manage for the archive's admins, in Twitch purple with a Twitch mark so it stands out.
import { useRoute } from 'vue-router'
import TwitchMark from './TwitchMark.vue'

const route = useRoute()
</script>

<template>
  <UiButton to="/manage" size="sm" class="manage-link" :pressed="route.path.startsWith('/manage')">
    <TwitchMark />
    Manage
  </UiButton>
</template>

<style scoped>
.manage-link { gap: 6px; border-color: #9146ff; background: color-mix(in srgb, #9146ff 22%, transparent); color: var(--vods-ink); }
.manage-link:hover { background: color-mix(in srgb, #9146ff 34%, transparent); }
</style>
