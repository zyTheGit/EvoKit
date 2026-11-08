<script setup>
// 分区列表（待审草稿 / 已归档 / 已拒绝）：路由 props 注入端点与文案，三分区共用此组件
import { useList } from '../composables/useApi';
import CardMeta from '../components/CardMeta.vue';

const props = defineProps({
  endpoint: { type: String, required: true },
  title: { type: String, required: true },
  emptyText: { type: String, default: '当前没有内容' },
});

const { data, loading, error } = useList(() => props.endpoint);
</script>

<template>
  <el-skeleton v-if="loading" :rows="4" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <el-empty v-else-if="!data?.cards?.length" :description="emptyText" />
  <template v-else>
    <el-alert
      type="info"
      :closable="false"
      class="tip"
      :title="`共 ${data.cards.length} 张 · ${title}（本页只读；accept/reject/merge 裁决请用 evokit review）`"
    />
    <el-card v-for="card in data.cards" :key="card.id" shadow="never" class="card-item">
      <CardMeta :card="card" />
      <div class="summary">{{ card.summary || '（无正文）' }}</div>
      <div class="ops">
        <router-link :to="`/cards/${encodeURIComponent(card.id)}`">
          <el-button size="small" link type="primary">查看详情</el-button>
        </router-link>
        <el-button size="small" link type="info" disabled title="只读模式：请在 CLI 执行 evokit review">网页裁决（未开放）</el-button>
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
