<script setup>
// 同步状态标签：consistent / drifted / missing 三态（与 CLI check 口径一致的中文文案）
import { computed } from 'vue';

const props = defineProps({
  status: { type: String, default: 'missing' },
});

const MAP = {
  consistent: { label: '已一致', type: 'success' },
  drifted: { label: '有漂移', type: 'warning' },
  missing: { label: '缺失', type: 'danger' },
};

const info = computed(() => MAP[props.status] ?? { label: props.status, type: 'info' });
</script>

<template>
  <el-tag :type="info.type" size="small">{{ info.label }}</el-tag>
</template>
