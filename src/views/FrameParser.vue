<script setup lang="ts">
import { ref } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import ToolCard from '../components/ToolCard.vue';
type DataType = 'UINT16' | 'INT16' | 'UINT32' | 'INT32' | 'UINT64' | 'INT64' | 'FLOAT32' | 'FLOAT64';
type Rule = { id: number; name: string; offset: number; type: DataType; order: string };
const types: DataType[] = ['UINT16', 'INT16', 'UINT32', 'INT32', 'UINT64', 'INT64', 'FLOAT32', 'FLOAT64'];
const rules = ref<Rule[]>([]);
const rawFrame = ref('');
const format = ref('Modbus RTU');
const frameType = ref('auto');
let nextId = 1;
function orders(type: DataType): string[] {
  if (type.endsWith('16')) { return ['AB', 'BA']; }
  if (type.endsWith('32')) { return ['ABCD', 'BADC', 'CDAB', 'DCBA']; }
  return ['ABCDEFGH', 'BADCFEHG', 'GHEFCDAB', 'HGFEDCBA'];
}
function addRule() {
  rules.value.push({ id: nextId++, name: '', offset: 0, type: 'UINT16', order: 'AB' });
}
function changeType(rule: Rule) { rule.order = orders(rule.type)[0]!; }
</script>
<template>
  <div class="parser-layout form-stack">
    <ToolCard title="原始报文" subtitle="可编辑输入；解析计算尚未接入">
      <div class="form-stack">
        <div class="input-pair">
          <label>传输格式<select v-model="format"><option>Modbus RTU</option><option>Modbus ASCII</option><option>Modbus TCP</option></select></label>
          <label>报文类型<select v-model="frameType"><option value="auto">自动识别</option><option value="request">请求帧</option><option value="response">正常响应帧</option><option value="exception">异常响应帧</option></select></label>
        </div>
        <label>完整报文<textarea v-model="rawFrame" rows="3" placeholder="请输入完整报文" /></label>
        <div class="action-row"><button disabled class="primary-button">解析报文（待实现）</button><button class="secondary-button" @click="rawFrame = ''">清空报文</button></div>
      </div>
    </ToolCard>
    <ToolCard title="解析规则配置" subtitle="位置为完整报文字节偏移，从 0 开始；当前仅编辑规则，不执行解析">
      <button class="secondary-button add-rule-button" @click="addRule"><Plus :size="16" />添加规则</button>
      <p v-if="rules.length === 0" class="rules-empty">暂无规则，点击“添加规则”配置字段。</p>
      <div class="rule-list">
        <div v-for="(rule, index) in rules" :key="rule.id" class="rule-row">
          <label>字段名称<input v-model="rule.name" :aria-label="`规则 ${index + 1} 字段名称`" placeholder="例如：温度" /></label>
          <label>位置（从 0 开始）<input v-model.number="rule.offset" type="number" min="0" step="1" :aria-label="`规则 ${index + 1} 字节偏移`" /></label>
          <label>数据类型<select v-model="rule.type" :aria-label="`规则 ${index + 1} 数据类型`" @change="changeType(rule)"><option v-for="type in types" :key="type">{{ type }}</option></select></label>
          <label>字节序<select v-model="rule.order" :aria-label="`规则 ${index + 1} 字节序`"><option v-for="order in orders(rule.type)" :key="order">{{ order }}</option></select></label>
          <button class="delete-rule-button" :aria-label="`删除规则 ${index + 1}`" @click="rules = rules.filter(item => item.id !== rule.id)"><Trash2 :size="16" /><span>删除</span></button>
        </div>
      </div>
    </ToolCard>
    <ToolCard title="解析结果" subtitle="字段、规则结果与校验状态将在此显示">
      <div class="empty-state">暂无解析结果<p>后续支持原始数据与字段联动高亮</p></div>
    </ToolCard>
  </div>
</template>
