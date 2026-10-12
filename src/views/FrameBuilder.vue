<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy, Plus, Trash2 } from 'lucide-vue-next';
import ToolCard from '../components/ToolCard.vue';
import { dataTypes, getByteLength, getByteOrders, decodeDataValue, formatDataValue } from '../core/data-conversion';
import { buildRtuFrame, exceptionCodes, type FrameInput, type FrameType, type FunctionCode, type RegisterItem, type BuiltFrame } from '../core/modbus/builder';

const commands: { code: FunctionCode; name: string }[] = [
  { code: 1, name: '读取线圈' }, { code: 2, name: '读取离散输入' },
  { code: 3, name: '读取保持寄存器' }, { code: 4, name: '读取输入寄存器' },
  { code: 5, name: '写单个线圈' }, { code: 6, name: '写单个寄存器' },
  { code: 15, name: '写多个线圈' }, { code: 16, name: '写多个寄存器' },
];
const frameType = ref<FrameType>('request');
const functionCode = ref<FunctionCode>(3);
const unitId = ref('1');
const address = ref('0');
const addressRadix = ref<10 | 16>(10);
const quantity = ref('2');
const singleValue = ref('0');
const singleState = ref(false);
const exceptionCode = ref(2);
let nextId = 1;
const newItem = (): RegisterItem & { id: number } => ({ id: nextId++, type: 'UINT16', order: 'AB', value: '0' });
const items = ref([newItem()]);
const states = ref([{ id: nextId++, value: false }]);
const coilQuantity = ref<string | number>('1');
const coilStates = ref([false]);
const result = ref<BuiltFrame | null>(null);
const error = ref('');
const copyMessage = ref('');
const isException = computed(() => frameType.value === 'exception');
const isRequest = computed(() => frameType.value === 'request');
const registerList = computed(() => !isException.value && ((functionCode.value === 16 && isRequest.value) || ([3, 4].includes(functionCode.value) && !isRequest.value)));
const stateList = computed(() => !isException.value && ((functionCode.value === 15 && isRequest.value) || ([1, 2].includes(functionCode.value) && !isRequest.value)));
const coilSelector = computed(() => !isException.value && ((isRequest.value && functionCode.value === 15) || (!isRequest.value && functionCode.value === 2)));
const coilLabel = computed(() => functionCode.value === 2 ? '离散输入' : '线圈');
const coilLimit = computed(() => functionCode.value === 2 ? 2000 : 1968);
const coilCount = computed(() => {
  // 数字输入框的 v-model 会将有效输入转为 number，空输入仍为字符串。
  const text = String(coilQuantity.value).trim();
  const count = Number(text);
  return /^\d+$/.test(text) && Number.isInteger(count) && count >= 1 && count <= coilLimit.value ? count : null;
});
const coilRows = computed(() => {
  if (coilCount.value === null) {
    return [];
  }
  return Array.from({ length: Math.ceil(coilStates.value.length / 8) }, (_, index) => {
    const offset = index * 8;
    const values = coilStates.value.slice(offset, offset + 8);
    const byte = values.reduce((sum, state, bit) => sum | (state ? 1 << bit : 0), 0);
    return { offset, values, byte };
  });
});
watch(coilCount, count => {
  if (count === null) {
    return;
  }
  coilStates.value = Array.from({ length: count }, (_, index) => coilStates.value[index] ?? false);
}, { flush: 'sync' });
const hasAddress = computed(() => !isException.value && (isRequest.value || functionCode.value >= 5));
const hasQuantity = computed(() => !isException.value && ((isRequest.value && functionCode.value <= 4) || (!isRequest.value && functionCode.value >= 15)));
const registerCount = computed(() => items.value.reduce((sum, item) => sum + getByteLength(item.type) / 2, 0));
const registerLimit = computed(() => isRequest.value ? 123 : 125);
const stateLimit = computed(() => isRequest.value ? 1968 : 2000);
const quantityLimit = computed(() => [1, 2].includes(functionCode.value) ? 2000 : functionCode.value === 15 ? 1968 : functionCode.value === 16 ? 123 : 125);
const broadcastAllowed = computed(() => isRequest.value && [5, 6, 15, 16].includes(functionCode.value));
const hex = (value: number, width = 2) => value.toString(16).toUpperCase().padStart(width, '0');
const bytesText = (data: readonly number[]) => data.map(byte => hex(byte)).join(' ');
const parsedAddress = computed(() => {
  try {
    return protocolAddress();
  } catch {
    return null;
  }
});
const formatAddress = (value: number) => addressRadix.value === 16 ? hex(value, 4) : String(value);
const itemRows = computed(() => {
  let offset = 0;
  return items.value.map(item => {
    const count = getByteLength(item.type) / 2;
    const start = parsedAddress.value === null ? null : parsedAddress.value + offset;
    const first = isRequest.value ? (start === null ? '待填写' : formatAddress(start)) : String(offset + 1);
    const last = isRequest.value ? (start === null ? '待填写' : formatAddress(start + count - 1)) : String(offset + count);
    const location = first === last ? first : `${first}～${last}`;
    offset += count;
    return { item, count, location };
  });
});
const structureRows = computed(() => {
  if (!result.value) {
    return [];
  }
  const dataFields = result.value.fields.filter(field => field.name.startsWith('数据项 '));
  return result.value.fields.flatMap(field => {
    if (field.name.startsWith('数据项 ')) {
      return field === dataFields[0] ? [{ ...field, name: '数据区', bytes: dataFields.flatMap(item => item.bytes), description: `${result.value!.quantity} 个寄存器` }] : [];
    }
    let description = field.description;
    let name = field.name;
    if (name === '功能码') {
      const command = commands.find(item => item.code === functionCode.value)!;
      description = isException.value ? `${command.name}的异常响应（原始功能码 ${hex(command.code)}）` : command.name;
    } else if (name.includes('协议地址')) {
      description = `十进制 ${description}`;
    } else if (name === '读取数量' || name === '写入数量') {
      description += [1, 2, 15].includes(functionCode.value) ? ' 个状态' : ' 个寄存器';
    } else if (name === '数据字节数') {
      description += ' 字节';
    } else if (name === '状态数据' || name === '线圈数据') {
      name = '数据区';
      description = functionCode.value === 2 ? '离散输入状态位图' : '线圈开关位图';
    }
    return [{ ...field, name, description }];
  });
});
const dataDetails = computed(() => {
  if (!result.value || !registerList.value) {
    return [];
  }
  const fields = result.value.fields.filter(field => field.name.startsWith('数据项 '));
  return fields.map((field, index) => {
    const row = itemRows.value[index];
    return { ...row, bytes: field.bytes, value: formatDataValue(decodeDataValue(field.bytes, row.item.type, row.item.order)), offset: field.offset };
  });
});
watch([frameType, functionCode, unitId, address, addressRadix, quantity, singleValue, singleState, exceptionCode, items, states, coilQuantity, coilStates], () => {
  result.value = null;
  error.value = '';
  copyMessage.value = '';
}, { deep: true, flush: 'sync' });

function decimal(input: string, name: string): number {
  if (!/^\d+$/.test(input.trim())) {
    throw new Error(`${name}请输入十进制非负整数`);
  }
  const value = Number(input);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name}超出允许范围`);
  }
  return value;
}
function protocolAddress(): number {
  const text = addressRadix.value === 16 ? address.value.replace(/\s+/g, '') : address.value.trim();
  const valid = addressRadix.value === 10 ? /^\d+$/.test(text) : /^[0-9a-f]+$/i.test(text);
  if (!valid) {
    throw new Error(`协议地址请输入${addressRadix.value === 10 ? '十进制非负整数' : '十六进制数字，可带空格，不带 0x 前缀'}`);
  }
  const value = Number.parseInt(text, addressRadix.value);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error('协议地址必须在 0～65535（0000～FFFF）之间');
  }
  return value;
}
function changeAddressRadix(event: Event) {
  const checkbox = event.target as HTMLInputElement;
  const next = checkbox.checked ? 16 : 10;
  try {
    if (!address.value.trim()) {
      addressRadix.value = next;
      return;
    }
    const value = protocolAddress();
    addressRadix.value = next;
    address.value = next === 16 ? hex(value, 4) : String(value);
  } catch (cause) {
    checkbox.checked = addressRadix.value === 16;
    error.value = cause instanceof Error ? cause.message : '请先填写有效地址再切换进制';
  }
}
function configuration(): FrameInput {
  const base = { unitId: decimal(unitId.value, '从站地址') };
  const code = functionCode.value;
  if (frameType.value === 'exception') {
    return { ...base, frameType: 'exception', functionCode: code, exceptionCode: exceptionCode.value };
  }
  if (code === 5) {
    return { ...base, frameType: frameType.value, functionCode: code, address: protocolAddress(), state: singleState.value };
  }
  if (code === 6) {
    return { ...base, frameType: frameType.value, functionCode: code, address: protocolAddress(), value: decimal(singleValue.value, '寄存器值') };
  }
  if (frameType.value === 'request') {
    const start = protocolAddress();
    if (code === 15) {
      if (coilCount.value === null) {
        throw new Error('线圈数量请输入 1～1968 的十进制整数');
      }
      return { ...base, frameType: 'request', functionCode: code, address: start, states: coilStates.value };
    }
    if (code === 16) {
      return { ...base, frameType: 'request', functionCode: code, address: start, items: items.value };
    }
    return { ...base, frameType: 'request', functionCode: code, address: start, quantity: decimal(quantity.value, '读取数量') };
  }
  if (code === 2) {
    if (coilCount.value === null) {
      throw new Error('离散输入数量请输入 1～2000 的十进制整数');
    }
    return { ...base, frameType: 'response', functionCode: code, states: coilStates.value };
  }
  if (code === 1) {
    return { ...base, frameType: 'response', functionCode: code, states: states.value.map(item => item.value) };
  }
  if (code === 3 || code === 4) {
    return { ...base, frameType: 'response', functionCode: code, items: items.value };
  }
  return { ...base, frameType: 'response', functionCode: code, address: protocolAddress(), quantity: decimal(quantity.value, '写入数量') };
}
function run() {
  result.value = null;
  error.value = '';
  copyMessage.value = '';
  try {
    result.value = buildRtuFrame(configuration());
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '生成失败，请检查参数';
  }
}
function reset() {
  unitId.value = '1'; addressRadix.value = 10; address.value = '0'; quantity.value = '2'; singleValue.value = '0';
  singleState.value = false; exceptionCode.value = 2;
  items.value = [newItem()]; states.value = [{ id: nextId++, value: false }];
  coilQuantity.value = '1'; coilStates.value = [false];
  result.value = null; error.value = ''; copyMessage.value = '';
}
async function copyFrame() {
  if (!result.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(bytesText(result.value.bytes));
    copyMessage.value = '已复制';
  } catch {
    copyMessage.value = '复制失败，请选择结果手动复制';
  }
}
</script>

<template>
  <div class="workspace-grid builder-layout">
    <ToolCard title="参数配置" subtitle="Modbus RTU · 本地组帧">
      <form class="form-stack" @submit.prevent="run">
        <div class="input-pair">
          <label>传输格式<select><option>Modbus RTU</option><option disabled>Modbus ASCII（待实现）</option><option disabled>Modbus TCP（待实现）</option></select></label>
          <label>报文类型<select v-model="frameType"><option value="request">请求帧</option><option value="response">正常响应帧</option><option value="exception">异常响应帧</option></select></label>
        </div>
        <div class="input-pair">
          <label>从站地址（十进制）<input v-model="unitId" inputmode="numeric" :placeholder="broadcastAllowed ? '0～247' : '1～247'" /></label>
          <label>{{ isException ? '原始功能码' : '功能码' }}<select v-model="functionCode"><option v-for="command in commands" :key="command.code" :value="command.code">{{ hex(command.code) }} · {{ command.name }}</option></select></label>
        </div>
        <div v-if="hasAddress || hasQuantity || coilSelector" class="input-pair">
          <div v-if="hasAddress" class="builder-address-field">
            <label>{{ functionCode === 5 || functionCode === 6 ? '协议地址' : '起始协议地址' }}<input v-model="address" :inputmode="addressRadix === 10 ? 'numeric' : 'text'" :placeholder="addressRadix === 10 ? '0～65535' : '0000～FFFF'" /></label>
            <label class="builder-radix-toggle"><input type="checkbox" :checked="addressRadix === 16" aria-label="协议地址使用十六进制" @change="changeAddressRadix" />十六进制</label>
          </div>
          <label v-if="hasQuantity">{{ isRequest ? '读取数量' : '写入数量' }}（十进制）<input v-model="quantity" inputmode="numeric" :placeholder="`1～${quantityLimit}`" /></label>
          <label v-else-if="coilSelector">{{ coilLabel }}数量（十进制）<input v-model="coilQuantity" inputmode="numeric" :placeholder="`1～${coilLimit}`" type="number" min="1" :max="coilLimit" step="1" /></label>
          <label v-else-if="!isException && functionCode === 5">线圈状态<select v-model="singleState"><option :value="false">关闭 · 00 00</option><option :value="true">开启 · FF 00</option></select></label>
          <label v-else-if="!isException && functionCode === 6">寄存器值（UINT16 · 十进制）<input v-model="singleValue" inputmode="numeric" placeholder="0～65535" /></label>
        </div>
        <p v-if="broadcastAllowed && unitId.trim() === '0'" class="checksum-hint">广播写入：所有支持此命令的从站执行写入，不返回响应。</p>
        <label v-if="isException">异常码<select v-model="exceptionCode"><option v-for="item in exceptionCodes" :key="item.code" :value="item.code">{{ hex(item.code) }} · {{ item.name }}</option></select></label>
        <p v-if="isException" class="checksum-hint">异常功能码自动设为原始功能码 + 0x80，不包含正常响应的数据字段。</p>
        <div v-if="registerList" class="form-stack">
          <div class="builder-list-heading"><span>寄存器数据项</span><button type="button" class="secondary-button" :disabled="registerCount >= registerLimit" @click="items.push(newItem())"><Plus :size="16" />添加数据项</button></div>
          <p class="checksum-hint">{{ items.length }} 个数据项 · {{ registerCount }} 个寄存器 · {{ registerCount * 2 }} 个数据字节。</p>
          <p v-if="!items.length" class="rules-empty">暂无数据项，请点击“添加数据项”。</p>
          <div v-if="items.length" class="builder-table-wrap">
            <table class="builder-register-table">
              <thead><tr><th>{{ isRequest ? `协议地址（${addressRadix === 10 ? '十进制' : '十六进制'}）` : '寄存器序号' }}</th><th>数据类型</th><th>字节序</th><th>数值（十进制）</th><th>操作</th></tr></thead>
              <tbody><tr v-for="(row, index) in itemRows" :key="row.item.id">
                <td :title="`第 ${index + 1} 项，占 ${row.count} 个寄存器`"><code>{{ row.location }}</code></td>
                <td><select v-model="row.item.type" :aria-label="`数据项 ${index + 1} 数据类型`" @change="row.item.order = getByteOrders(row.item.type)[0]"><option v-for="type in dataTypes" :key="type">{{ type }}</option></select></td>
                <td><select v-model="row.item.order" :aria-label="`数据项 ${index + 1} 字节序`"><option v-for="order in getByteOrders(row.item.type)" :key="order">{{ order }}</option></select></td>
                <td><input v-model="row.item.value" :aria-label="`数据项 ${index + 1} 数值`" /></td>
                <td><button type="button" class="delete-rule-button" :aria-label="`删除数据项 ${index + 1}`" @click="items = items.filter(item => item.id !== row.item.id)"><Trash2 :size="16" />删除</button></td>
              </tr></tbody>
            </table>
          </div>
          <p class="checksum-hint">多字节数值整体编码后按两个字节拆分寄存器。修改类型会重置字节序，并重新计算后续位置。</p>
        </div>
        <div v-if="coilSelector" class="form-stack">
          <div class="builder-list-heading"><span>{{ coilLabel }}选择（序号）</span></div>
          <p v-if="coilCount === null" class="checksum-error" role="alert">{{ coilLabel }}数量请输入 1～{{ coilLimit }} 的十进制整数。</p>
          <template v-else>
            <p class="checksum-hint">{{ coilCount }} 个{{ coilLabel }} · {{ coilRows.length }} 个数据字节。</p>
            <div class="builder-coil-panel">
              <div class="builder-coil-grid">
                <div class="builder-coil-heading"><span>序号</span><div class="builder-coil-data"><span>HEX</span><span :title="`从高位到低位排列，最右侧为该行第一个${coilLabel}`">二进制</span></div></div>
                <div v-for="row in coilRows" :key="row.offset" class="builder-coil-row">
                  <div class="builder-coil-buttons">
                    <button v-for="(state, index) in row.values" :key="row.offset + index" type="button" class="builder-coil-button" :class="{ active: state }" :aria-pressed="state" :aria-label="`${coilLabel} ${row.offset + index + 1}：${state ? '开启' : '关闭'}`" :title="state ? '开启（1）' : '关闭（0）'" @click="coilStates[row.offset + index] = !state">{{ String(row.offset + index + 1).padStart(4, '0') }}</button>
                  </div>
                  <div class="builder-coil-data" :title="`${coilLabel} ${row.offset + 1}～${row.offset + row.values.length} 的数据字节`"><code>{{ hex(row.byte) }}</code><code>{{ row.byte.toString(2).padStart(8, '0') }}</code></div>
                </div>
              </div>
            </div>
          </template>
        </div>
        <div v-else-if="stateList" class="form-stack">
          <div class="builder-list-heading"><span>{{ functionCode === 2 ? '离散输入状态' : '线圈状态' }}</span><button type="button" class="secondary-button" :disabled="states.length >= stateLimit" @click="states.push({ id: nextId++, value: false })"><Plus :size="16" />添加状态</button></div>
          <p class="checksum-hint">{{ states.length }} 个状态 · {{ Math.ceil(states.length / 8) }} 个数据字节。</p>
          <p v-if="!states.length" class="rules-empty">暂无状态，请点击“添加状态”。</p>
          <div v-if="states.length" class="builder-table-wrap">
            <table class="builder-state-table">
              <thead><tr><th>{{ isRequest ? `协议地址（${addressRadix === 10 ? '十进制' : '十六进制'}）` : '状态序号' }}</th><th>状态</th><th>操作</th></tr></thead>
              <tbody><tr v-for="(item, index) in states" :key="item.id">
                <td><code>{{ isRequest ? (parsedAddress !== null ? formatAddress(parsedAddress + index) : '待填写') : index + 1 }}</code></td>
                <td><select v-model="item.value" :aria-label="`状态项 ${index + 1} 状态`"><option :value="false">0 · 关闭</option><option :value="true">1 · 开启</option></select></td>
                <td><button type="button" class="delete-rule-button" :aria-label="`删除状态项 ${index + 1}`" @click="states = states.filter(state => state.id !== item.id)"><Trash2 :size="16" />删除</button></td>
              </tr></tbody>
            </table>
          </div>
        </div>
        <div class="action-row"><button type="submit" class="primary-button" :disabled="(registerList && !items.length) || (stateList && !coilSelector && !states.length)">生成报文</button><button type="button" class="secondary-button" @click="reset">重置参数</button></div>
        <p v-if="error" role="alert" class="checksum-error">{{ error }}</p>
      </form>
    </ToolCard>
    <ToolCard title="报文预览" subtitle="完整 RTU 报文与字段明细">
      <div v-if="result" class="form-stack" aria-live="polite">
        <div><div class="result-label result-copy-label">完整报文（HEX）</div><div class="result-copy-row"><pre class="result-copy-content">{{ bytesText(result.bytes) }}</pre><button class="result-copy-button" aria-label="复制完整报文" @click="copyFrame"><Copy :size="16" />复制</button></div></div>
        <p class="checksum-hint">{{ result.bytes.length }} 字节<span v-if="result.quantity !== undefined"> · {{ result.quantity }} {{ [1, 2, 15].includes(functionCode) ? '个状态' : '个寄存器' }}</span></p>
        <div>
          <div class="result-label result-copy-label">报文结构</div>
          <div class="builder-table-wrap builder-result-table-wrap">
            <table class="builder-structure-table">
              <thead><tr><th>字段</th><th>HEX</th><th>含义</th></tr></thead>
              <tbody><tr v-for="field in structureRows" :key="field.offset">
                <td :title="`字节偏移：${field.offset}${field.bytes.length > 1 ? `～${field.offset + field.bytes.length - 1}` : ''}（从 0 开始）`">{{ field.name }}</td>
                <td><code>{{ bytesText(field.bytes) }}</code></td>
                <td>{{ field.description }}</td>
              </tr></tbody>
            </table>
          </div>
        </div>
        <div v-if="dataDetails.length">
          <div class="result-label result-copy-label">数据区明细</div>
          <div class="builder-table-wrap builder-result-table-wrap">
            <table class="builder-data-table">
              <thead><tr><th>{{ isRequest ? `协议地址（${addressRadix === 10 ? '十进制' : '十六进制'}）` : '寄存器序号' }}</th><th>数据类型</th><th>字节序</th><th>HEX</th><th>实际数值</th></tr></thead>
              <tbody><tr v-for="row in dataDetails" :key="row.item.id">
                <td :title="`字节偏移：${row.offset}～${row.offset + row.bytes.length - 1}（从 0 开始）`"><code>{{ row.location }}</code></td>
                <td>{{ row.item.type }}</td><td>{{ row.item.order }}</td><td><code>{{ bytesText(row.bytes) }}</code></td><td><code>{{ row.value }}</code></td>
              </tr></tbody>
            </table>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">暂无报文<p>配置参数后点击“生成报文”；修改参数后清除旧结果。</p></div>
      <p v-if="copyMessage" role="status" class="checksum-hint converter-copy-status">{{ copyMessage }}</p>
    </ToolCard>
  </div>
</template>
