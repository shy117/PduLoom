<script setup lang="ts">
import type { FrameField } from '../core/modbus/builder';

const props = defineProps<{ fields: readonly FrameField[]; interactive?: boolean; selected?: { offset: number; length: number } }>();
const emit = defineEmits<{ select: [offset: number, length: number] }>();
const hex = (bytes: readonly number[]) => bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const position = (field: FrameField) => `字节偏移：${field.offset}（从 0 开始）；长度：${field.bytes.length} 字节`;
function isSelected(field: FrameField): boolean {
  return !!props.selected && field.offset < props.selected.offset + props.selected.length && field.offset + field.bytes.length > props.selected.offset;
}
</script>

<template>
  <div>
    <div class="result-label result-copy-label">报文结构</div>
    <div class="data-table-wrap builder-result-table-wrap">
      <table class="data-table builder-structure-table">
        <thead><tr><th>字段</th><th>HEX</th><th>含义</th></tr></thead>
        <tbody><tr v-for="(field, index) in fields" :key="index" :class="{ 'parser-selected': isSelected(field) }">
          <td :title="position(field)"><button v-if="interactive" type="button" class="structure-field-button" :aria-label="`${field.name}，${position(field)}`" @click="emit('select', field.offset, field.bytes.length)">{{ field.name }}</button><span v-else>{{ field.name }}</span></td>
          <td><code>{{ hex(field.bytes) }}</code></td>
          <td>{{ field.description }}</td>
        </tr></tbody>
      </table>
    </div>
  </div>
</template>
