<script setup lang="ts">
// Twitch's mark on the account menu's Manage item and "Sign in with Twitch": the site's own art (createVodsApp's
// `art.twitchGlyph`), or a placeholder of the same size. Inline, so it sits beside the text in any site's controls.
import { art } from '../art'
</script>

<template>
  <component :is="art.twitchGlyph" v-if="art.twitchGlyph" class="twitch-mark" aria-hidden="true" />
  <UiPlaceholder v-else label="tw" :w="16" :h="16" class="twitch-mark ph" aria-hidden="true" />
</template>

<style scoped>
.twitch-mark { flex: none; display: inline-flex; vertical-align: middle; }
.ph { font-size: 8px; border-color: #bf94ff; }
</style>
