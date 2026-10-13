<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { Copy } from 'lucide-vue-next';

const props = defineProps<{ text: string }>();
const label = ref('复制');
const pending = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let operation = 0;
function reset() {
  operation++;
  if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  label.value = '复制';
  pending.value = false;
}
async function copy() {
  reset();
  const current = operation;
  pending.value = true;
  try {
    await navigator.clipboard.writeText(props.text);
    if (current !== operation) { return; }
    label.value = '已复制';
  } catch {
    if (current !== operation) { return; }
    label.value = '复制失败';
  }
  pending.value = false;
  timer = setTimeout(reset, 2000);
}
watch(() => props.text, reset, { flush: 'sync' });
onDeactivated(reset);
onBeforeUnmount(reset);
</script>

<template>
  <button type="button" class="result-copy-button" :disabled="pending" :title="label === '复制失败' ? '复制失败，请选择结果手动复制' : undefined" @click="copy"><Copy :size="16" /><span aria-live="polite">{{ label }}</span></button>
</template>
