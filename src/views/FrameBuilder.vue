<script setup lang="ts">
import ToolCard from '../components/ToolCard.vue';
</script>

<template>
  <div class="workspace-grid">
    <ToolCard title="参数配置" subtitle="第二阶段完成核心后接入实际计算">
      <fieldset disabled class="form-stack">
        <label>传输格式<select><option>Modbus RTU</option><option>Modbus ASCII</option><option>Modbus TCP</option></select></label>
        <label>报文类型<select><option>请求帧</option><option>正常响应帧</option><option>异常响应帧</option></select></label>
        <label>功能码<select><option>03 · 读取保持寄存器</option></select></label>
        <div class="input-pair"><label>从站地址<input value="1" /></label><label>起始地址<input value="0" /></label></div>
        <label>读取数量<input value="2" /></label>
      </fieldset>
    </ToolCard>
    <ToolCard title="报文预览" subtitle="固定演示数据 · 非实时计算结果">
      <div class="result-label">完整报文 <span class="badge">演示</span></div>
      <pre class="hex-output">01 03 00 00 00 02 C4 0B</pre>
      <div class="field-list"><div><span>从站地址</span><code>01</code></div><div><span>功能码</span><code>03</code></div><div><span>起始地址</span><code>00 00</code></div><div><span>读取数量</span><code>00 02</code></div><div><span>CRC16</span><code>C4 0B</code></div></div>
      <button disabled class="secondary-button">复制报文（待实现）</button>
    </ToolCard>
  </div>
</template>
