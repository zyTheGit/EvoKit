<script setup>
// 报告阅读：inventory 审计报告 Markdown 渲染
import { watch } from 'vue';
import { useList } from '../composables/useApi';
import MarkdownView from '../components/MarkdownView.vue';

const props = defineProps({
  name: { type: String, required: true },
});

const { data, loading, error, reload } = useList(() => `/api/reports/${encodeURIComponent(props.name)}`);
watch(() => props.name, reload);
</script>

<template>
  <div class="head">
    <el-tag>{{ props.name }}</el-tag>
    <router-link to="/reports" class="back"><el-button size="small" link>← 返回报告库</el-button></router-link>
  </div>
  <el-skeleton v-if="loading" :rows="8" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <el-card v-else-if="data" shadow="never">
    <MarkdownView :source="data.raw" />
  </el-card>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.back { margin-left: auto; }
</style>
