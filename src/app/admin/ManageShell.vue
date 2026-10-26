<script setup lang="ts">
// Frame for every Manage page: the site's own shell (public nav, account menu, the Manage button), the Manage bar,
// a dimmer sky, and the page's heading.
import VodsShell from '../components/VodsShell.vue'
import ManageBar from './ManageBar.vue'
import { session } from './session'

defineProps<{ title: string }>()
</script>

<template>
  <VodsShell sky="dim">
    <ManageBar v-if="session.authenticated" />
    <UiPageHead eyebrow="Manage" :title="title">
      <template v-if="$slots.actions" #actions><slot name="actions"></slot></template>
    </UiPageHead>
    <slot></slot>
  </VodsShell>
</template>
