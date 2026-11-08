<script setup>
// 同步状态：三入口托管块一致性（与 evokit check 完全同口径）
import { useList, formatDate } from '../composables/useApi';
import StatusTag from '../components/StatusTag.vue';

const { data, loading, error } = useList('/api/sync-status');
</script>

<template>
  <el-skeleton v-if="loading" :rows="4" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <template v-else-if="data">
    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="期望块 = 指向该入口的全部 text 资源合并内容（context + knowledge-index）。出现漂移时运行 evokit sync 修复。"
    />
    <el-table :data="data.entries">
      <el-table-column prop="name" label="入口" width="140">
        <template #default="{ row }">{{ row.name }} <span class="muted">({{ row.id }})</span></template>
      </el-table-column>
      <el-table-column prop="file" label="文件" min-width="240" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }"><status-tag :status="row.status" /></template>
      </el-table-column>
      <el-table-column label="最后修改时间" width="180">
        <template #default="{ row }">{{ formatDate(row.lastSyncAt) }}</template>
      </el-table-column>
    </el-table>
  </template>
</template>

<style scoped>
.tip { margin-bottom: 16px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
