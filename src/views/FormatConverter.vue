<script setup lang="ts">
import { ref, watch } from 'vue';
import ToolCard from '../components/ToolCard.vue';
import CopyButton from '../components/CopyButton.vue';
import { convertModbusFrame, type ModbusFormat, type ConvertedFrame } from '../core/modbus/converter';
import { normalizeAsciiTextInput } from '../core/modbus/ascii';

const source = ref<ModbusFormat>('rtu');
const target = ref<ModbusFormat>('ascii');

const input = ref('');
const unitId = ref('');
const transactionId = ref('1');
const result = ref<ConvertedFrame>();
const error = ref('');
const formats = [{ value: 'rtu', name: 'Modbus RTU' }, { value: 'ascii', name: 'Modbus ASCII' }, { value: 'tcp', name: 'Modbus TCP' }] as const;
watch([source, target, input, unitId, transactionId], () => { result.value = undefined; error.value = '';  }, { flush: 'sync' });
function integer(text: string, name: string): number {
  if (!/^\d+$/.test(text.trim())) { throw new Error(`${name}请输入十进制非负整数`); }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) { throw new Error(`${name}超出允许范围`); }
  return value;
}
function run() {
  result.value = undefined; error.value = '';
  try {
    result.value = convertModbusFrame({ text: source.value === 'ascii' ? normalizeAsciiTextInput(input.value) : input.value, source: source.value, target: target.value, unitId: unitId.value.trim() ? integer(unitId.value, '目标设备标识') : undefined, transactionId: target.value === 'tcp' ? integer(transactionId.value, '事务标识') : undefined });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '转换失败'; }
}

function clear() { input.value = ''; result.value = undefined; error.value = '';  }
</script>
<template>
  <div class="workspace-grid converter-layout">
    <ToolCard title="原始报文" subtitle="单条完整报文转换；源校验和业务结构必须有效">
      <form class="form-stack" @submit.prevent="run">
        <div class="input-pair">
          <label>源格式<select v-model="source"><option v-for="format in formats" :key="format.value" :value="format.value">{{ format.name }}</option></select></label>
          <label>目标格式<select v-model="target"><option v-for="format in formats" :key="format.value" :value="format.value">{{ format.name }}</option></select></label>
        </div>

        <label>完整报文<textarea v-model="input" rows="5" :placeholder="source === 'ascii' ? '请输入冒号开头、CRLF 结尾的 ASCII 文本' : '请输入完整 HEX，可用空格或换行分隔'" /></label>
        <p v-if="source === 'ascii'" class="checksum-hint">文本框末尾单个 LF 按 CRLF 处理，缺失结束符仍不能转换。</p>
        <label>目标{{ target === 'tcp' ? '单元标识' : '从站地址' }}（十进制，可选）<input v-model="unitId" :placeholder="target === 'tcp' ? '留空沿用源标识；0～255' : '留空沿用源地址；1～247，0 仅允许广播写请求'" inputmode="numeric" /></label>
        <label v-if="target === 'tcp'">目标事务标识（十进制）<input v-model="transactionId" placeholder="0～65535" inputmode="numeric" /></label>
        <div class="action-row"><button class="primary-button" type="submit">转换报文</button><button class="secondary-button" type="button" @click="clear">清空报文</button></div>
        <p v-if="error" class="checksum-error" role="alert">{{ error }}</p>
      </form>
    </ToolCard>
    <ToolCard title="转换结果" subtitle="重新计算校验或 MBAP 长度，保留业务数据">
      <div v-if="result" class="form-stack">
        <div class="result-label">完整报文（{{ target === 'ascii' ? 'ASCII 文本' : 'HEX' }}）</div>
        <div class="result-copy-row"><pre class="result-copy-content">{{ target === 'ascii' ? result.text.replace(/\r\n$/, '<CR><LF>') : result.text }}</pre><CopyButton :text="result.text" aria-label="复制完整报文" /></div>
        <p class="checksum-hint">{{ result.bytes.length }} {{ target === 'ascii' ? '个解码字节；复制包含实际 CRLF' : '字节' }} · 目标设备标识 {{ result.unitId }}<span v-if="result.transactionId !== undefined"> · 事务标识 {{ result.transactionId }}</span></p>
        <p v-for="message in result.warnings" :key="message" class="parser-warning">{{ message }}</p>

      </div>
      <div v-else class="empty-state">暂无转换结果<p>配置格式并输入完整报文后转换；无效源报文不能转换。</p></div>
    </ToolCard>
  </div>
</template>
