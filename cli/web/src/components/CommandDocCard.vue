<script setup>
// 单条命令的用法文档卡（执行页选中命令即显 + 「全部文档」tab 复用）
defineProps({
  cmd: { type: String, required: true },
  doc: { type: Object, required: true }, // { summary, usage, flags, examples, notes, tier }
});

const emit = defineEmits(['fill']);

// 点击示例：剥离 'evokit <cmd>' 前缀后回填参数框
function fillExample(example) {
  const parts = String(example).trim().split(/\s+/);
  if (parts[0] === 'evokit') parts.shift();
  if (parts[0] === props.cmd) parts.shift();
  emit('fill', parts.join(' '));
}
</script>

<template>
  <div class="doc-card">
    <div class="doc-summary">
      <el-tag :type="doc.tier === 'safe' ? 'success' : 'warning'" size="small" class="tier-tag">
        {{ doc.tier === 'safe' ? '安全' : '需确认' }}
      </el-tag>
      <span>{{ doc.summary }}</span>
    </div>

    <div class="doc-usage"><code>{{ doc.usage }}</code></div>

    <el-table v-if="doc.flags?.length" :data="doc.flags" size="small" class="doc-flags">
      <el-table-column prop="name" label="参数 / 子命令" width="220">
        <template #default="{ row }"><code class="flag-name">{{ row.name }}</code><span v-if="row.alias" class="alias">（{{ row.alias }}）</span></template>
      </el-table-column>
      <el-table-column prop="desc" label="说明" min-width="300" />
    </el-table>
    <div v-else class="no-flags">该命令无额外参数。</div>

    <div v-if="doc.examples?.length" class="doc-examples">
      <span class="label">示例（点击回填参数框）：</span>
      <code
        v-for="ex in doc.examples"
        :key="ex"
        class="example"
        style="cursor: pointer"
        @click="fillExample(ex)"
      >{{ ex }}</code>
    </div>

    <div v-if="doc.notes" class="doc-notes">ℹ {{ doc.notes }}</div>
  </div>
</template>

<style scoped>
.doc-card { display: flex; flex-direction: column; gap: 10px; }
.doc-summary { display: flex; align-items: flex-start; gap: 8px; line-height: 1.6; }
.tier-tag { flex-shrink: 0; margin-top: 1px; }
.doc-usage code {
  display: inline-block;
  background: var(--el-fill-color);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  word-break: break-all;
}
.flag-name { background: var(--el-fill-color); padding: 1px 5px; border-radius: 4px; }
.alias { color: var(--el-text-color-secondary); font-size: 12px; }
.no-flags { color: var(--el-text-color-secondary); font-size: 13px; }
.doc-examples { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.doc-examples .label { font-size: 12px; color: var(--el-text-color-secondary); }
.example {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.example:hover { background: var(--el-color-primary-light-8); }
.doc-notes { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
</style>
