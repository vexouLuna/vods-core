<script setup lang="ts">
// Frame for every page: the site shell with the public nav and the account menu (the shared sign-in). Manage lives in
// the account menu (the Manage bar itself is on the Manage pages, admin/ManageShell.vue). Slots pass through to the
// site's UiShell.
import AccountMenu from './AccountMenu.vue'
import { nav } from '../lib/nav'

withDefaults(defineProps<{ fill?: boolean; header?: boolean; sky?: 'full' | 'dim' | 'off' }>(), { header: true })
</script>

<template>
  <UiShell :nav="nav()" :fill="fill" :header="header" :sky="sky">
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}"></slot></template>
    <template v-if="!$slots.account" #account>
      <AccountMenu />
    </template>
  </UiShell>
</template>
