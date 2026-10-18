<script setup lang="ts">
import VodsShell from '../components/VodsShell.vue'
</script>

<template>
  <VodsShell>
    <UiEmptyState code="404" title="Nothing here" text="That page doesn't exist. The VOD you're after is probably in the list.">
      <template #actions>
        <UiButton to="/vods" variant="primary">Browse VODs</UiButton>
        <UiButton href="https://vexoul.net">vexoul.net</UiButton>
      </template>
    </UiEmptyState>
  </VodsShell>
</template>
