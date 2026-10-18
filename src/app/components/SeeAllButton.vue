<script setup lang="ts">
// "See all VODs" / "See all playthroughs" on the home tiles: a link to that list's page, as a button in its own
// colour, so it stands out from the green Watch and the plain controls around it: a solid fill in the info colour.

defineProps<{ to: string }>()
</script>

<template>
  <UiButton :to="to" class="see-all"><slot /> →</UiButton>
</template>

<style scoped>
.see-all {
  color: var(--vods-bg); font-weight: 600; background: var(--vods-info); border-color: var(--vods-info);
  box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none;
}
.see-all:hover { color: var(--vods-bg); background: var(--vods-info); border-color: var(--vods-info); filter: brightness(1.1); }
</style>
