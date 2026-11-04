<script setup lang="ts">
// /manage/schedules: the worker's recurring jobs (/api/v2/schedules), in UTC: pause one, run it now, or make, edit and
// delete them.
import { SchedulesBrowser } from '@vex/platform-web/vue'
import { onMounted } from 'vue'
import ManageShell from '../../admin/ManageShell.vue'
import { platform } from '../../admin/platform'
import { site } from '../../site'

onMounted(() => {
  document.title = `Schedules · Manage · ${site.name}`
})
</script>

<template>
  <ManageShell title="Schedules">
    <SchedulesBrowser :client="platform" />
  </ManageShell>
</template>
