<script setup lang="ts">
import ToolCard from '../components/ToolCard.vue';
</script>

<template>
  <div class="workspace-grid">
    <ToolCard title="原始报文" subtitle="转换前将检查报文完整性与校验">
      <fieldset disabled class="form-stack">
        <label>源格式<select><option>Modbus RTU</option><option>Modbus ASCII</option><option>Modbus TCP</option></select></label>
        <label>完整报文<textarea rows="5" placeholder="请输入完整报文" /></label>
        <label>目标格式<select><option>Modbus ASCII</option><option>Modbus RTU</option><option>Modbus TCP</option></select></label>
        <button class="primary-button">转换报文（待实现）</button>
      </fieldset>
    </ToolCard>
    <ToolCard title="转换结果" subtitle="保留功能码与业务数据，重新生成传输封装">
      <div class="empty-state">暂无转换结果<p>校验失败的报文不能转换</p></div>
      <button disabled class="secondary-button">复制结果（待实现）</button>
    </ToolCard>
  </div>
</template>
