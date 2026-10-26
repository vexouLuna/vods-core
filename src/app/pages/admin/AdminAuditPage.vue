<script setup lang="ts">
// /manage/audit?action=&target=&actor=&actor_kind=&outcome=: the worker's audit log (GET /api/v2/audit), newest
// first: every change made through the admin API (dashboard or API key), what the worker's own jobs did, and refused
// or failed requests. Filters live in the URL.
import { AuditBrowser, auditFiltersFrom, auditFiltersQuery, type AuditFilters } from '@vex/platform-web/vue'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ManageShell from '../../admin/ManageShell.vue'
import { platform } from '../../admin/platform'
import { site } from '../../site'

const route = useRoute()
const router = useRouter()

const filters = computed<AuditFilters>({
  get: () => auditFiltersFrom(route.query),
  set: (f) => router.replace({ query: auditFiltersQuery(f) }),
})

onMounted(() => (document.title = `Audit log · Manage · ${site.name}`))
</script>

<template>
  <ManageShell title="Audit log">
    <AuditBrowser v-model:filters="filters" :client="platform" hide-scope :poll="30_000" action-hint="vod. or job.enqueue" target-hint="vod: or vod:2345678901" />
  </ManageShell>
</template>
