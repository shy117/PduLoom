<script setup lang="ts">
import ToolCard from '../components/ToolCard.vue';
</script>

<template>
  <div class="checksum-layout">
    <ToolCard title="校验计算器" subtitle="独立工具 · 算法将在第二阶段实现">
      <fieldset disabled class="form-stack"><label>校验算法<select><option>CRC16 / Modbus</option><option>LRC / Modbus ASCII</option></select></label><label>十六进制数据<textarea rows="4" placeholder="例如：01 03 00 00 00 02" /></label><label>操作方式<select><option>计算追加校验值</option><option>验证完整报文</option></select></label><button class="primary-button">计算校验值（待实现）</button></fieldset>
      <div class="demo-result"><div class="result-label">示例校验值 <span class="badge">演示</span></div><code class="large-code">0BC4</code><p>示例输入：<code>01 03 00 00 00 02</code></p><p>实际追加字节：<code>C4 0B</code></p></div>
      <button disabled class="secondary-button">复制结果（待实现）</button>
    </ToolCard>
  </div>
</template>
