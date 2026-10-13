<script setup lang="ts">
import { ref, watch } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import ToolCard from '../components/ToolCard.vue';
import { dataTypes, getByteOrders } from '../core/data-conversion';
import { parseRtuFrame, type ParseRule, type ParsedFrame } from '../core/modbus/parser';
import type { FrameType } from '../core/modbus/builder';

type Rule = ParseRule & { id: number };
const rules = ref<Rule[]>([]);
const rawFrame = ref('');
const frameType = ref<FrameType | 'auto'>('auto');
const result = ref<ParsedFrame>();
const error = ref('');
const selected = ref<{ offset: number; length: number }>();
let nextId = 1;
const hex = (bytes: readonly number[]) => bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const crcHex = (crc: number) => crc.toString(16).toUpperCase().padStart(4, '0');
const typeNames = { request: '请求帧', response: '正常响应帧', exception: '异常响应帧' };
watch([rawFrame, frameType, rules], () => { result.value = undefined; error.value = ''; selected.value = undefined; }, { deep: true, flush: 'sync' });
function addRule() { rules.value.push({ id: nextId++, name: '', offset: 0, type: 'UINT16', order: 'AB' }); }
function changeType(rule: Rule) { rule.order = getByteOrders(rule.type)[0]!; }
function parse() {
  selected.value = undefined;
  result.value = undefined;
  error.value = '';
  try { result.value = parseRtuFrame(rawFrame.value, frameType.value, rules.value); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '解析失败'; }
}
function clear() { rawFrame.value = ''; result.value = undefined; error.value = ''; selected.value = undefined; }
function highlight(offset: number, length: number) { selected.value = { offset, length }; }
function activeByte(index: number) { return selected.value && index >= selected.value.offset && index < selected.value.offset + selected.value.length; }
</script>
<template>
  <div class="parser-layout form-stack">
    <ToolCard title="原始报文" subtitle="输入单条完整 RTU 报文，包含末尾两个 CRC 字节">
      <div class="form-stack">
        <div class="input-pair">
          <label>传输格式<select><option>Modbus RTU</option><option disabled>Modbus ASCII（待实现）</option><option disabled>Modbus TCP（待实现）</option></select></label>
          <label>报文类型<select v-model="frameType"><option value="auto">自动识别</option><option value="request">请求帧</option><option value="response">正常响应帧</option><option value="exception">异常响应帧</option></select></label>
        </div>
        <label>完整报文<textarea v-model="rawFrame" rows="3" placeholder="支持连续 HEX 或空格、换行分隔的完整字节" /></label>
        <div class="action-row"><button class="primary-button" @click="parse">解析报文</button><button class="secondary-button" @click="clear">清空报文</button></div>
        <p v-if="error" class="checksum-error" role="alert">{{ error }}</p>
      </div>
    </ToolCard>
    <ToolCard title="解析规则配置" subtitle="位置为完整报文字节偏移，从 0 开始；规则按指定类型和字节序独立解码">
      <div class="form-stack">
        <div class="builder-list-heading"><span>解析规则 · {{ rules.length }} 项</span><button type="button" class="secondary-button" @click="addRule"><Plus :size="16" />添加规则</button></div>
        <p v-if="rules.length === 0" class="rules-empty">暂无规则，仍可解析标准协议字段。</p>
        <div v-else class="builder-table-wrap">
          <table class="builder-register-table parser-rule-table">
            <thead><tr><th>字段名称</th><th>位置（从 0 开始）</th><th>数据类型</th><th>字节序</th><th>操作</th></tr></thead>
            <tbody><tr v-for="(rule, index) in rules" :key="rule.id">
              <td><input v-model="rule.name" :aria-label="`规则 ${index + 1} 字段名称`" placeholder="例如：温度" /></td>
              <td><input v-model.number="rule.offset" type="number" min="0" step="1" :aria-label="`规则 ${index + 1} 字节偏移`" /></td>
              <td><select v-model="rule.type" :aria-label="`规则 ${index + 1} 数据类型`" @change="changeType(rule)"><option v-for="type in dataTypes" :key="type">{{ type }}</option></select></td>
              <td><select v-model="rule.order" :aria-label="`规则 ${index + 1} 字节序`"><option v-for="order in getByteOrders(rule.type)" :key="order">{{ order }}</option></select></td>
              <td><button type="button" class="delete-rule-button" :aria-label="`删除规则 ${index + 1}`" @click="rules = rules.filter(item => item.id !== rule.id)"><Trash2 :size="16" />删除</button></td>
            </tr></tbody>
          </table>
        </div>
      </div>
    </ToolCard>
    <ToolCard title="解析结果" subtitle="选择字段或原始字节可联动高亮；CRC 状态与协议结构分别显示">
      <div v-if="!result" class="empty-state">暂无解析结果</div>
      <div v-else class="form-stack">
        <div class="parser-summary">
          <span>长度：{{ result.bytes.length }} 字节</span><span>从站地址：{{ result.unitId }}</span><span>功能码：{{ hex([result.functionCode]) }}</span>
          <span>类型：{{ result.warnings.some(message => message.includes('无法确定方向')) ? '请求或正常响应（方向不确定）' : result.payload ? typeNames[result.payload.frameType] : '未确定' }}</span>
          <span :class="result.crc.valid ? 'checksum-success' : 'checksum-error'">CRC：{{ result.crc.valid ? '通过' : '失败' }}；收到 {{ crcHex(result.crc.receivedCrc) }} / 计算 {{ crcHex(result.crc.calculatedCrc) }}</span>
          <span :class="result.errors.length ? 'checksum-error' : ''">协议结构：{{ result.errors.length ? '不符合' : result.supported ? '符合' : '详细结构未检查' }}</span>
        </div>
        <div v-if="result.errors.length" class="checksum-error" role="alert"><p v-for="message in result.errors" :key="message">{{ message }}</p></div>
        <div v-if="result.warnings.length" class="parser-warning"><p v-for="message in result.warnings" :key="message">{{ message }}</p></div>
        <div class="parser-bytes" aria-label="原始报文字节">
          <button v-for="(byte, index) in result.bytes" :key="index" :title="`字节偏移 ${index}`" :aria-label="`字节偏移 ${index}：${hex([byte])}`" :class="{ active: activeByte(index) }" @click="highlight(index, 1)">{{ hex([byte]) }}</button>
        </div>
        <div class="converter-table-wrap"><table class="converter-table parser-table"><thead><tr><th>字段</th><th>偏移</th><th>长度</th><th>HEX</th><th>含义</th></tr></thead><tbody>
          <tr v-for="field in result.fields" :key="field.offset" :class="{ 'parser-selected': selected && field.offset < selected.offset + selected.length && field.offset + field.bytes.length > selected.offset }"><td><button class="parser-field-button" @click="highlight(field.offset, field.bytes.length)">{{ field.name }}</button></td><td>{{ field.offset }}</td><td>{{ field.bytes.length }}</td><td>{{ hex(field.bytes) }}</td><td>{{ field.description }}</td></tr>
        </tbody></table></div>
        <template v-if="result.payload?.registers.length">
          <h3>寄存器数据（UINT16）</h3><div class="converter-table-wrap"><table class="converter-table"><thead><tr><th>序号</th><th>协议地址</th><th>偏移</th><th>HEX</th><th>数值</th></tr></thead><tbody>
            <tr v-for="(item, index) in result.payload.registers" :key="item.offset"><td>{{ index + 1 }}</td><td>{{ item.address ?? '未提供' }}</td><td>{{ item.offset }}</td><td><button class="parser-field-button" @click="highlight(item.offset, 2)">{{ hex(result.bytes.slice(item.offset, item.offset + 2)) }}</button></td><td>{{ item.value }}</td></tr>
          </tbody></table></div>
        </template>
        <template v-if="result.payload?.states.length">
          <h3>状态数据（低位优先）</h3><div class="parser-states"><button v-for="(item, index) in result.payload.states" :key="index" :class="{ active: item.value }" :title="`偏移 ${item.offset}，位 ${item.bit}，协议地址 ${item.address ?? '未提供'}`" @click="highlight(item.offset, 1)">{{ index + 1 }}：{{ item.value ? '开' : '关' }}</button></div>
        </template>
        <template v-if="result.rules.length">
          <h3>自定义规则结果</h3><div class="converter-table-wrap"><table class="converter-table"><thead><tr><th>名称</th><th>偏移</th><th>类型</th><th>字节序</th><th>HEX</th><th>数值 / 错误</th></tr></thead><tbody>
            <tr v-for="(rule, index) in result.rules" :key="index"><td>{{ rule.name || `规则 ${index + 1}` }}</td><td>{{ rule.offset }}</td><td>{{ rule.type }}</td><td>{{ rule.order }}</td><td><button class="parser-field-button" :disabled="!rule.bytes.length" @click="highlight(rule.offset, rule.bytes.length)">{{ hex(rule.bytes) }}</button></td><td :class="{ 'checksum-error': rule.error }">{{ rule.error ?? rule.value }}</td></tr>
          </tbody></table></div>
        </template>
      </div>
    </ToolCard>
  </div>
</template>
