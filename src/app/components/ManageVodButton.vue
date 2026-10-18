<script setup lang="ts">
// 🔧 to a VOD's Manage page, while an admin's dashboard session is live. The parent places it (position: absolute),
// so it takes no room and nothing moves when it shows; it must sit outside any link (no link in a link).
import { session } from '../admin/session'

defineProps<{ id: string }>()
</script>

<template>
  <UiButton
    v-if="session.authenticated"
    :to="`/manage/vods/${encodeURIComponent(id)}`"
    size="sm"
    icon
    label="Manage this VOD"
    class="manage-vod"
  >
    <span aria-hidden="true">🔧</span>
  </UiButton>
</template>

<style scoped>
.manage-vod { position: absolute; z-index: 3; }
</style>
