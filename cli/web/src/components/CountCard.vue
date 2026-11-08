<script setup>
// 计数卡：总览页四区计数展示
defineProps({
  label: { type: String, required: true },
  count: { type: [Number, String], default: null },
  tone: { type: String, default: 'primary' }, // success | warning | info | danger | primary
  hint: { type: String, default: '' },
});
</script>

<template>
  <el-card shadow="never" class="count-card">
    <div class="count" :data-tone="tone">{{ count ?? '-' }}</div>
    <div class="label">{{ label }}</div>
    <div v-if="hint" class="hint">{{ hint }}</div>
  </el-card>
</template>

<style scoped>
.count-card { text-align: center; }
.count { font-size: 32px; font-weight: 700; line-height: 1.2; }
.count[data-tone='success'] { color: var(--el-color-success); }
.count[data-tone='warning'] { color: var(--el-color-warning); }
.count[data-tone='info'] { color: var(--el-color-info); }
.count[data-tone='danger'] { color: var(--el-color-danger); }
.count[data-tone='primary'] { color: var(--el-color-primary); }
.label { margin-top: 4px; font-weight: 600; }
.hint { margin-top: 2px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
