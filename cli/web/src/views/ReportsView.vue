<script setup>
// 报告库：inventory 冗余审计报告清单（新在前）
import { useList, formatDate, formatSize } from '../composables/useApi';

const { data, loading, error } = useList('/api/reports');
</script>

<template>
  <el-skeleton v-if="loading" :rows="4" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <el-empty v-else-if="!data?.reports?.length" description="reports/ 目录还没有报告（evokit inventory 会生成）" />
  <el-table v-else :data="data.reports">
    <el-table-column label="报告文件" min-width="300">
      <template #default="{ row }">
        <router-link :to="`/reports/${encodeURIComponent(row.name)}`">
          <el-button link type="primary">{{ row.name }}</el-button>
        </router-link>
      </template>
    </el-table-column>
    <el-table-column label="体积" width="110">
      <template #default="{ row }">{{ formatSize(row.size) }}</template>
    </el-table-column>
    <el-table-column label="生成时间" width="180">
      <template #default="{ row }">{{ formatDate(row.mtime) }}</template>
    </el-table-column>
  </el-table>
</template>
