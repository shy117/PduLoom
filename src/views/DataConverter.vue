<script setup lang="ts">
import ToolCard from '../components/ToolCard.vue';
</script>

<template>
  <div class="workspace-grid">
    <ToolCard title="转换配置" subtitle="数据转换核心待实现">
      <fieldset disabled class="form-stack"><label>数据类型<select><option v-for="type in ['UINT16', 'INT16', 'UINT32', 'INT32', 'UINT64', 'INT64', 'FLOAT32', 'FLOAT64']" :key="type">{{ type }}</option></select></label><label>转换方向<select><option>数值转原始字节</option><option>原始字节转数值</option></select></label><label>输入数据<textarea rows="3" placeholder="请输入数值或十六进制字节" /></label><label>字节序<select><option>AB · 高字节在前（16 位示例）</option></select></label><div class="input-pair"><label>系数<input value="1" /></label><label>偏移量<input value="0" /></label></div><button class="primary-button">转换数据（待实现）</button></fieldset>
    </ToolCard>
    <ToolCard title="转换结果" subtitle="数值、字节与寄存器数据">
      <div class="empty-state">暂无转换结果<p>64 位整数将使用 BigInt，暂不支持系数和偏移量</p></div><button disabled class="secondary-button">复制结果（待实现）</button>
    </ToolCard>
  </div>
</template>
