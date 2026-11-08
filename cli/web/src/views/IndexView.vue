<script setup>
// 知识索引：从 context.md 中提取「# EvoKit 知识索引」段的索引行（- [id] 摘要），
// 逐行可点击跳转对应卡片详情。索引行格式为 ADR 0009 全链路唯一规则，客户端解析稳定。
import { computed } from 'vue';
import { useList } from '../composables/useApi';

const { data, loading, error } = useList('/api/context');

// 索引行格式：`- [id] 标记+标题 #tags`（与 knowledge-index.md 完全一致）
const LINE_RE = /^- \[([^\]]+)\]\s*(.*)$/;

const lines = computed(() => {
  const raw = data.value?.raw ?? '';
  const start = raw.indexOf('# EvoKit 知识索引');
  if (start === -1) return [];
  return raw.slice(start).split('\n')
    .map((line) => line.match(LINE_RE))
    .filter(Boolean)
    .map((m) => ({ id: m[1], text: m[2].trim() }));
});
</script>

<template>
  <el-skeleton v-if="loading" :rows="6" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <el-empty v-else-if="lines.length === 0" description="context.md 中没有找到「# EvoKit 知识索引」段" />
  <el-card v-else shadow="never">
    <template #header>共 {{ lines.length }} 行 · 点击行内「详情」查看卡片</template>
    <div v-for="line in lines" :key="line.id" class="index-line">
      <span class="line-text">{{ line.text }}</span>
      <router-link :to="`/cards/${encodeURIComponent(line.id)}`" class="line-id">
        <el-button size="small" link type="primary">{{ line.id }}</el-button>
      </router-link>
    </div>
  </el-card>
</template>

<style scoped>
.index-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.index-line:last-child { border-bottom: none; }
.line-text { flex: 1; }
.line-id { flex-shrink: 0; }
</style>
