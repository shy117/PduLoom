<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy } from 'lucide-vue-next';
import ToolCard from '../components/ToolCard.vue';
import { calculateCrc16, verifyCrc16 } from '../core/checksum/crc16';
import { calculateLrc, verifyLrc, formatLrcAsciiFrame } from '../core/checksum/lrc';
import { formatCrc16Bytes, type CrcByteOrder } from '../core/checksum/crc16-format';
import { parseHexBytes } from '../core/hex';

type Result = { checksum: number; payload: number[]; received?: number; receivedBytes?: number[]; valid?: boolean };
const algorithm = ref<'crc16' | 'lrc'>('crc16');
const checksumName = computed(() => algorithm.value === 'crc16' ? 'CRC16' : 'LRC');
const checksumLength = computed(() => algorithm.value === 'crc16' ? 2 : 1);
const input = ref('');
const mode = ref<'calculate' | 'verify'>('calculate');
const order = ref<CrcByteOrder>('low-first');
const result = ref<Result | null>(null);
const error = ref('');
const copyMessage = ref('');
const exampleInput = computed(() => mode.value === 'calculate'
  ? '01 03 00 00 00 02'
  : `01 03 00 00 00 02 ${algorithm.value === 'lrc' ? 'FA' : order.value === 'low-first' ? 'C4 0B' : '0B C4'}`);
const hex = (value: number, length: number) => value.toString(16).toUpperCase().padStart(length, '0');
const bytesText = (bytes: readonly number[]) => bytes.map(byte => hex(byte, 2)).join(' ');
const checksumBytes = computed(() => result.value
  ? algorithm.value === 'crc16' ? formatCrc16Bytes(result.value.checksum, order.value) : [result.value.checksum]
  : []);
const checksumText = computed(() => bytesText(checksumBytes.value));
const frameText = computed(() => {
  if (!result.value) {
    return '';
  }
  const frame = [...result.value.payload, ...checksumBytes.value];
  return algorithm.value === 'lrc' ? formatLrcAsciiFrame(frame) : bytesText(frame);
});
watch([input, mode, algorithm], () => { result.value = null; error.value = ''; copyMessage.value = ''; }, { flush: 'sync' });
watch(order, () => {
  copyMessage.value = '';
  if (algorithm.value === 'crc16' && mode.value === 'verify' && result.value) {
    run();
  }
}, { flush: 'sync' });
function run() {
  if (!input.value.trim()) {
    input.value = exampleInput.value;
  }
  result.value = null;
  error.value = '';
  copyMessage.value = '';
  try {
    const data = parseHexBytes(input.value);
    if (mode.value === 'verify') {
      const check = algorithm.value === 'crc16' ? verifyCrc16(data, order.value) : verifyLrc(data);
      result.value = {
        checksum: 'calculatedCrc' in check ? check.calculatedCrc : check.calculatedLrc,
        payload: data.slice(0, -checksumLength.value),
        received: 'receivedCrc' in check ? check.receivedCrc : check.receivedLrc,
        receivedBytes: data.slice(-checksumLength.value),
        valid: check.valid,
      };
    } else {
      result.value = { checksum: algorithm.value === 'crc16' ? calculateCrc16(data) : calculateLrc(data), payload: data };
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '计算失败，请检查输入';
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
  <div class="checksum-layout">
    <ToolCard title="校验计算器" subtitle="通用校验工具 · 本地计算">
      <form class="form-stack" @submit.prevent="run">
        <label>校验算法<select v-model="algorithm"><option value="crc16">CRC16 / Modbus</option><option value="lrc">LRC / Modbus ASCII</option></select></label>
        <fieldset v-if="algorithm === 'crc16'" class="crc-order"><legend>输出字节顺序</legend><label><input v-model="order" type="radio" value="low-first" name="crc-order" />低字节在前（Modbus RTU 标准）</label><label><input v-model="order" type="radio" value="high-first" name="crc-order" />高字节在前</label></fieldset>
        <label>操作方式<select v-model="mode"><option value="calculate">计算追加校验值</option><option value="verify">验证完整报文</option></select></label>
        <label>{{ mode === 'verify' ? `完整报文（含末尾${checksumLength === 2 ? '两' : '一'}字节 ${checksumName}）` : `待计算数据（不含 ${checksumName}）` }}<textarea v-model="input" rows="4" :placeholder="exampleInput" spellcheck="false" /></label>
        <p class="checksum-hint">支持连续 HEX 或空格、换行分隔，不支持 0x 前缀。空输入时将填入示例再{{ mode === 'verify' ? '校验' : '计算' }}。</p>
        <p v-if="algorithm === 'lrc'" class="checksum-hint">LRC 对原始数据字节计算，输出一个字节；请输入 HEX 字节，不包含 ASCII 帧的冒号和 CRLF。{{ mode === 'verify' ? '校验时读取末尾一个字节作为 LRC。' : '' }}</p>
        <p v-else-if="mode === 'verify'" class="checksum-hint">按所选输出字节顺序读取末尾两字节 CRC；字节顺序不匹配也属于校验失败。</p>
        <div class="action-row"><button type="submit" class="primary-button">{{ mode === 'verify' ? '校验完整报文' : '计算' }}</button><button type="button" class="secondary-button" @click="input = ''">清空</button></div>
      </form>
      <p v-if="error" role="alert" class="checksum-error">{{ error }}</p>
      <div v-if="result" class="demo-result" aria-live="polite">
        <p>{{ checksumName }} 数值：<code>0x{{ hex(result.checksum, checksumLength * 2) }}</code></p>
        <div class="result-label result-copy-label"><span>{{ checksumName }} 字节<span class="result-copy-detail"> · {{ algorithm === 'lrc' ? '单字节' : order === 'low-first' ? '低字节在前' : '高字节在前' }}</span></span></div>
        <div class="result-copy-row"><pre class="result-copy-content">{{ checksumText }}</pre><button class="result-copy-button" :aria-label="`复制 ${checksumName} 字节`" :title="`复制 ${checksumName} 字节`" @click="copy(checksumText)"><Copy :size="16" />复制</button></div>
        <template v-if="result.received !== undefined"><p>报文中 {{ checksumName }} 字节：<code>{{ bytesText(result.receivedBytes!) }}</code></p><p>报文中 {{ checksumName }} 数值：<code>0x{{ hex(result.received, checksumLength * 2) }}</code></p><p :class="result.valid ? 'checksum-success' : 'checksum-error'">{{ result.valid ? `${checksumName} 校验通过` : `${checksumName} 校验失败：报文校验值与计算值不一致` }}</p><p>此结果仅判断校验值是否匹配，不代表报文业务结构有效。</p></template>
        <div class="crc-frame-heading"><span>{{ mode === 'verify' ? `重新生成的完整报文（替换原 ${checksumName}）` : '追加校验码后的完整报文' }}</span></div>
        <div class="result-copy-row"><pre class="result-copy-content">{{ frameText }}</pre><button class="result-copy-button" aria-label="复制完整报文" title="复制完整报文" @click="copy(frameText)"><Copy :size="16" />复制</button></div>
        <p v-if="algorithm === 'lrc'" class="checksum-hint">完整报文以冒号起始、CRLF 结束，无空格；复制包含实际回车和换行，可按文本 / ASCII 模式发送。</p>
        <p v-if="algorithm === 'crc16' && order === 'high-first'" class="checksum-hint">高字节在前的输出不符合 Modbus RTU 标准。</p>
      </div>
      <p v-if="copyMessage" role="status" class="checksum-hint">{{ copyMessage }}</p>
    </ToolCard>
  </div>
</template>
