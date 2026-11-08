<script setup>
// 变更历史：知识根提交时间线；带 :id 时为单卡 --follow 历史下钻
import { watch } from 'vue';
import { useList, formatDate } from '../composables/useApi';

const props = defineProps({
  id: { type: String, default: '' },
});

const { data, loading, error, reload } = useList(() => (props.id ? `/api/history/${encodeURIComponent(props.id)}` : '/api/history'));
watch(() => props.id, reload);

const short = (hash) => String(hash ?? '').slice(0, 8);
</script>

<template>
  <el-skeleton v-if="loading" :rows="6" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <template v-else-if="data">
    <div v-if="props.id" class="head">
      <el-tag>单卡历史：{{ props.id }}</el-tag>
      <router-link to="/history"><el-button size="small" link>← 返回全部历史</el-button></router-link>
      <router-link :to="`/cards/${encodeURIComponent(props.id)}`"><el-button size="small" link type="primary">卡片详情 →</el-button></router-link>
    </div>
    <el-alert v-if="data.available === false" type="warning" :closable="false" title="知识根尚未 git 初始化，暂无历史（evokit knowledge init 会创建并随后续 learn 自动提交）" />
    <el-empty v-else-if="!data.commits?.length" description="该卡还没有提交记录" />
    <el-timeline v-else class="timeline">
      <el-timeline-item
        v-for="commit in data.commits"
        :key="commit.hash"
        :timestamp="formatDate(commit.date)"
        placement="top"
      >
        <code class="hash">{{ short(commit.hash) }}</code>
        <span class="subject">{{ commit.subject }}</span>
      </el-timeline-item>
    </el-timeline>
  </template>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.timeline { padding-left: 8px; }
.hash { background: var(--el-fill-color); padding: 1px 6px; border-radius: 4px; margin-right: 8px; }
.subject { word-break: break-all; }
</style>
