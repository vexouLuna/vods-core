<script setup lang="ts">
// The Manage bar, at the top of every Manage page (ManageShell): the archive's admin sections and who is signed in.
// On a narrow screen it wraps; nothing is dropped.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { session } from './session'

const route = useRoute()

const LINKS = [
  { label: 'Overview', to: '/manage', exact: true },
  { label: 'Jobs', to: '/manage/jobs' },
  { label: 'VODs', to: '/manage/vods' },
  { label: 'Storage', to: '/manage/storage' },
  { label: 'YouTube', to: '/manage/youtube' },
  { label: 'Settings', to: '/manage/settings' },
  { label: 'Tags', to: '/manage/tags' },
  { label: 'Home', to: '/manage/home' },
  { label: 'Audit', to: '/manage/audit' },
]
const links = computed(() =>
  LINKS.map(({ label, to, exact }) => ({ label, to, current: exact ? route.path === to : route.path === to || route.path.startsWith(`${to}/`) })),
)

/** The password has no user: "admin" then. */
const who = computed(() => (session.user ? `@${session.user.login}` : 'admin (password)'))
</script>

<template>
  <UiNavBar :links="links" label="Manage" title="Manage">
    <template #trail><span class="who vods-mono">{{ who }}</span></template>
  </UiNavBar>
</template>

<style scoped>
.who { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
