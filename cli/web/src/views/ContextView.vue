<script setup>
// 全局偏好：context.md 全文渲染（托管块源文件）+ 三入口目标清单
import { useList } from '../composables/useApi';
import MarkdownView from '../components/MarkdownView.vue';

const { data, loading, error } = useList('/api/context');
</script>

<template>
  <el-skeleton v-if="loading" :rows="8" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <template v-else-if="data">
    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="这是 ~/.evokit/context.md（唯一源）。修改后运行 evokit sync 重新分发到三入口；本页面不提供编辑。"
    />
    <el-card shadow="never" class="block">
      <MarkdownView :source="data.raw" />
    </el-card>
    <el-card shadow="never" class="block">
      <template #header>同步目标（settings.json agents）</template>
      <el-table :data="data.targets" size="small">
        <el-table-column prop="id" label="agent id" width="120" />
        <el-table-column prop="name" label="名称" width="160" />
        <el-table-column prop="file" label="入口文件" />
      </el-table>
    </el-card>
  </template>
</template>

<style scoped>
.tip { margin-bottom: 16px; }
.block { margin-bottom: 16px; }
</style>
