<script setup>
// 分区卡列表（待审/归档/拒绝共用）：拉取对应端点，渲染卡片摘要 + 详情链接
import { useList } from '../composables/useApi';
import CardMeta from './CardMeta.vue';

const props = defineProps({
  endpoint: { type: String, required: true }, // /api/pending | /api/archive | /api/rejected
  emptyText: { type: String, default: '当前没有内容' },
  tip: { type: String, default: '' },
});

const { data, loading, error, reload } = useList(() => props.endpoint);
defineExpose({ reload });
</script>

<template>
  <el-skeleton v-if="loading" :rows="4" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <el-empty v-else-if="!data?.cards?.length" :description="emptyText" />
  <template v-else>
    <el-alert v-if="tip" type="info" :closable="false" class="tip" :title="tip" />
    <el-card v-for="card in data.cards" :key="card.id" shadow="never" class="card-item">
      <CardMeta :card="card" />
      <div class="summary">{{ card.summary || '（无正文）' }}</div>
      <div class="ops">
        <router-link :to="`/cards/${encodeURIComponent(card.id)}`">
          <el-button size="small" link type="primary">查看详情</el-button>
        </router-link>
      </div>
    </el-card>
  </template>
</template>

<style scoped>
.tip { margin-bottom: 16px; }
.card-item { margin-bottom: 12px; }
.summary { margin: 8px 0; color: var(--el-text-color-regular); }
.ops { display: flex; gap: 8px; }
</style>
