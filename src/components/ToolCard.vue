<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <section class="tool-card">
    <div class="card-heading"><h2>{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div>
    <div class="card-body"><slot /></div>
  </section>
</template>
