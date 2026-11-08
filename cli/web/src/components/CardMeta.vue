<script setup>
// 卡片元信息行：类型徽标 + 标题 + 标签 + 置信度 + 更新时间（列表/分区/详情共用）
import { computed } from 'vue';
import { formatDate } from '../composables/useApi';

const props = defineProps({
  card: { type: Object, required: true }, // { id, front, ... }
});

// type → emoji 徽标：镜像自 cli/src/knowledge-index.js TYPE_MARK（前端不能直接复用后端模块）
const TYPE_MARK = { pitfall: '⚠', pattern: '🏛', workflow: '🔧' };
// type → 中文标签：镜像自 knowledge-cards.js CARD_TYPES
const TYPE_LABEL = { fact: '事实', preference: '偏好', pattern: '模式', pitfall: '避坑', workflow: '工作流' };

const mark = computed(() => TYPE_MARK[props.card.front?.type] ?? '');
const typeLabel = computed(() => TYPE_LABEL[props.card.front?.type] ?? String(props.card.front?.type ?? '-'));
const tags = computed(() => {
  const t = props.card.front?.tags;
  if (Array.isArray(t)) return t.map(String);
  return t ? [String(t)] : [];
});
const confidence = computed(() => {
  const n = Number(props.card.front?.confidence);
  return Number.isFinite(n) && props.card.front?.confidence !== '' ? `${Math.round(n * 100)}%` : '-';
});
const updated = computed(() => formatDate(props.card.front?.updated));
</script>

<template>
  <div class="card-meta">
    <span class="title">{{ mark }}{{ card.front?.title ?? card.id }}</span>
    <el-tag size="small" type="info">{{ typeLabel }}</el-tag>
    <el-tag v-for="tag in tags" :key="tag" size="small" effect="plain">#{{ tag }}</el-tag>
    <span class="muted">置信 {{ confidence }} · 更新 {{ updated }}</span>
  </div>
</template>

<style scoped>
.card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.title { font-weight: 600; margin-right: 2px; }
.muted { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
