<script setup>
// 知识卡列表：confirmed 全量 + type/tag 筛选 + 排序（查询由后端执行，口径同契约 §8.3）
import { computed, reactive, watch } from 'vue';
import { useList, formatDate } from '../composables/useApi';

// 镜像自 cli/src/knowledge-cards.js CARD_TYPES（前端不能直接复用后端模块）
const TYPES = [
  { value: 'fact', label: '事实' },
  { value: 'preference', label: '偏好' },
  { value: 'pattern', label: '模式' },
  { value: 'pitfall', label: '避坑' },
  { value: 'workflow', label: '工作流' },
];

const query = reactive({ type: '', tag: '', sort: 'updated' });

const path = computed(() => {
  const params = new URLSearchParams();
  if (query.type) params.set('type', query.type);
  if (query.tag) params.set('tag', query.tag);
  if (query.sort) params.set('sort', query.sort);
  const qs = params.toString();
  return `/api/cards${qs ? `?${qs}` : ''}`;
});

const { data, loading, error, reload } = useList(() => path.value);
watch(path, reload);

// 标签筛选项 = 当前结果里出现过的全部 tags
const tagOptions = computed(() => {
  const set = new Set();
  for (const c of data.value?.cards ?? []) {
    const tags = Array.isArray(c.front?.tags) ? c.front.tags : (c.front?.tags ? [c.front.tags] : []);
    for (const t of tags) set.add(String(t));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
});

function typeLabel(type) {
  return TYPES.find((t) => t.value === type)?.label ?? String(type ?? '-');
}
</script>

<template>
  <el-card shadow="never" class="filter">
    <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 140px">
      <el-option v-for="t in TYPES" :key="t.value" :label="t.label" :value="t.value" />
    </el-select>
    <el-select v-model="query.tag" placeholder="全部标签" clearable style="width: 160px; margin-left: 8px">
      <el-option v-for="t in tagOptions" :key="t" :label="`#${t}`" :value="t" />
    </el-select>
    <el-radio-group v-model="query.sort" style="margin-left: 16px">
      <el-radio-button value="updated">按更新时间</el-radio-button>
      <el-radio-button value="title">按标题</el-radio-button>
    </el-radio-group>
    <span class="total">共 {{ data?.cards?.length ?? 0 }} 张</span>
  </el-card>

  <el-skeleton v-if="loading" :rows="5" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <el-empty v-else-if="!data?.cards?.length" description="没有符合条件的已入库卡" />
  <el-table v-else :data="data.cards" size="default">
    <el-table-column label="标题" min-width="280">
      <template #default="{ row }">
        <router-link :to="`/cards/${encodeURIComponent(row.id)}`">
          <el-button link type="primary">{{ row.front?.title ?? row.id }}</el-button>
        </router-link>
      </template>
    </el-table-column>
    <el-table-column label="类型" width="90">
      <template #default="{ row }">{{ typeLabel(row.front?.type) }}</template>
    </el-table-column>
    <el-table-column label="标签" min-width="160">
      <template #default="{ row }">
        <el-tag v-for="t in (Array.isArray(row.front?.tags) ? row.front.tags : [])" :key="t" size="small" effect="plain" class="tag">#{{ t }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="置信度" width="90">
      <template #default="{ row }">
        {{ Number.isFinite(Number(row.front?.confidence)) && row.front?.confidence !== '' ? `${Math.round(Number(row.front.confidence) * 100)}%` : '-' }}
      </template>
    </el-table-column>
    <el-table-column label="更新时间" width="170">
      <template #default="{ row }">{{ formatDate(row.front?.updated) }}</template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.filter { margin-bottom: 16px; }
.filter :deep(.el-card__body) { display: flex; align-items: center; }
.total { margin-left: auto; color: var(--el-text-color-secondary); font-size: 13px; }
.tag { margin-right: 4px; }
</style>
