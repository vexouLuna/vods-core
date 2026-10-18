<script setup lang="ts">
// UiShell on Deep Field: vex-ui's site shell (header, star sky, footer, toasts) as this network site.
import { VxSiteShell, type NavItem, type SiteId } from '@vex/ui'
import { site } from '../site'

defineProps<{ nav: NavItem[]; fill?: boolean; header?: boolean; sky?: 'full' | 'dim' | 'off' }>()
</script>

<template>
  <VxSiteShell :site="site.id as SiteId" :nav="nav" :fill="fill" :header="header" :sky="sky">
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}"></slot></template>
  </VxSiteShell>
</template>
