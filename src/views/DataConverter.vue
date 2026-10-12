<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy } from 'lucide-vue-next';
import ToolCard from '../components/ToolCard.vue';
import { parseHexBytes } from '../core/hex';
import { dataTypes, getByteLength, getByteOrders, encodeDataValue, decodeDataValue, formatDataValue, bytesToRegisters, type DataType, type ByteOrder } from '../core/data-conversion';

const type = ref<DataType>('FLOAT32');
const direction = ref<'encode' | 'decode'>('encode');
const order = ref<ByteOrder>('ABCD');
const input = ref('');
const result = ref<{ bytes: number[]; value: string; notice: string } | null>(null);
const error = ref('');
const copyMessage = ref('');
const byteLength = computed(() => getByteLength(type.value));
const orders = computed(() => getByteOrders(type.value));
const hex = (value: number, length: number) => value.toString(16).toUpperCase().padStart(length, '0');
const hexText = computed(() => result.value?.bytes.map(byte => hex(byte, 2)).join(' ') ?? '');
const registers = computed(() => result.value ? bytesToRegisters(result.value.bytes) : []);
const example = computed(() => {
  const value = type.value.startsWith('FLOAT') ? '1' : '20';
  return direction.value === 'encode' ? value : encodeDataValue(value, type.value, order.value).map(byte => hex(byte, 2)).join(' ');
});
const orderDescription: Record<ByteOrder, string> = {
  AB: '高字节在前', BA: '低字节在前',
  ABCD: '高字节在前', BADC: '寄存器内字节交换', CDAB: '寄存器顺序反转', DCBA: '全部字节反转',
  ABCDEFGH: '高字节在前', BADCFEHG: '寄存器内字节交换', GHEFCDAB: '寄存器顺序反转', HGFEDCBA: '全部字节反转',
};
watch(type, () => { order.value = getByteOrders(type.value)[0]; }, { flush: 'sync' });
watch([input, type, direction, order], () => {
  result.value = null;
  error.value = '';
  copyMessage.value = '';
}, { flush: 'sync' });

function run() {
  if (!input.value.trim()) {
    input.value = example.value;
  }
  result.value = null;
  error.value = '';
  copyMessage.value = '';
  try {
    const bytes = direction.value === 'encode'
      ? encodeDataValue(input.value, type.value, order.value) : parseHexBytes(input.value);
    const value = decodeDataValue(bytes, type.value, order.value);
    let notice = '';
    if (typeof value === 'number' && !Number.isFinite(value)) {
      notice = '当前结果是 IEEE 754 特殊值（NaN 或无穷大），不是普通有限数值。';
    } else if (direction.value === 'encode' && type.value === 'FLOAT32' && !Object.is(value, Number(input.value.trim()))) {
      notice = '输入已按 FLOAT32 精度舍入，右侧显示字节实际表示的数值。';
    }
    result.value = { bytes, value: formatDataValue(value), notice };
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '转换失败，请检查输入';
  }
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copyMessage.value = '已复制';
  } catch {
    copyMessage.value = '复制失败，请选择结果手动复制';
  }
}
</script>

<template>
  <div class="workspace-grid converter-layout">
    <ToolCard title="转换配置" subtitle="数值与 HEX 字节双向转换 · 本地计算">
      <form class="form-stack" @submit.prevent="run">
        <div class="input-pair">
          <label>数据类型<select v-model="type"><option v-for="item in dataTypes" :key="item">{{ item }}</option></select></label>
          <label>转换方向<select v-model="direction"><option value="encode">数值 → HEX 字节</option><option value="decode">HEX 字节 → 数值</option></select></label>
        </div>
        <label>字节序<select v-model="order"><option v-for="item in orders" :key="item" :value="item">{{ item }} · {{ orderDescription[item] }}</option></select></label>
        <p class="checksum-hint">{{ byteLength }} 字节 · {{ byteLength / 2 }} 个寄存器。A 表示标准大端编码的最高字节，后续字母依次表示其他字节。</p>
        <label>{{ direction === 'encode' ? '输入数值（十进制）' : '输入 HEX 字节' }}<textarea v-model="input" rows="4" :placeholder="example" spellcheck="false" /></label>
        <p v-if="direction === 'decode'" class="checksum-hint">输入一个数据项，必须恰好 {{ byteLength }} 字节。支持连续 HEX 或空格、换行分隔，不支持 0x 前缀。</p>
        <p v-else-if="type.startsWith('FLOAT')" class="checksum-hint">支持小数、科学计数法、NaN 和 Infinity。浮点数按 IEEE 754 精度舍入；过大或下溢为零的有限数值会报错。</p>
        <p v-else class="checksum-hint">输入一个十进制整数，不支持小数、科学计数法或进制前缀。64 位整数保持完整精度。</p>
        <p class="checksum-hint">空输入时自动填入当前类型、方向和字节序对应的示例再转换。</p>
        <div class="action-row">
          <button type="submit" class="primary-button">转换数据</button>
          <button type="button" class="secondary-button" @click="input = ''">清空</button>
        </div>
        <p v-if="error" role="alert" class="checksum-error">{{ error }}</p>
      </form>
    </ToolCard>
    <ToolCard title="转换结果" subtitle="实际数值、HEX 字节与寄存器拆分">
      <div v-if="result" class="form-stack" aria-live="polite">
        <div>
          <div class="result-label result-copy-label">数值（十进制）</div>
          <div class="result-copy-row"><pre class="result-copy-content">{{ result.value }}</pre><button class="result-copy-button" aria-label="复制数值" @click="copy(result.value)"><Copy :size="16" />复制</button></div>
        </div>
        <div>
          <div class="result-label result-copy-label"><span>HEX 字节<span class="result-copy-detail"> · {{ order }}</span></span></div>
          <div class="result-copy-row"><pre class="result-copy-content">{{ hexText }}</pre><button class="result-copy-button" aria-label="复制 HEX 字节" @click="copy(hexText)"><Copy :size="16" />复制</button></div>
        </div>
        <p v-if="result.notice" class="checksum-hint" role="status">{{ result.notice }}</p>
        <div class="result-label">{{ byteLength }} 字节 · {{ registers.length }} 个寄存器</div>
        <div class="converter-table-wrap">
          <table class="converter-table"><thead><tr><th>寄存器序号</th><th>HEX 字节</th><th>UINT16 值</th></tr></thead><tbody><tr v-for="(value, index) in registers" :key="index"><td>{{ index + 1 }}</td><td><code>{{ hex(value >> 8, 2) }} {{ hex(value & 255, 2) }}</code></td><td>{{ value }}</td></tr></tbody></table>
        </div>
        <p class="checksum-hint">按当前字节序每两个字节拆分为一个寄存器，序号从 1 开始，不代表设备地址。UINT16 值是原始字节的解释，不是浮点数分段转换。</p>
      </div>
      <div v-else class="empty-state">暂无转换结果<p>输入数值或 HEX 字节后点击“转换数据”。</p></div>
      <p v-if="copyMessage" role="status" class="checksum-hint converter-copy-status">{{ copyMessage }}</p>
    </ToolCard>
  </div>
</template>
