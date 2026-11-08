<script setup>
// 采集概览：9 源水位线聚合（纯统计数字，不展示会话原文）+ distill 水位线状态
import { useList, formatDate } from '../composables/useApi';

const { data, loading, error } = useList('/api/inbox');
</script>

<template>
  <el-skeleton v-if="loading" :rows="5" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <template v-else-if="data">
    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="数据来自 state.json 聚合（事件数/文件数/最近采集时间）。会话原文仅保存在 inbox，网页端不展示。"
    />
    <el-card shadow="never" class="block">
      <template #header>采集源水位线</template>
      <el-empty v-if="!data.sources?.length" description="state.json 还没有采集记录（evokit harvest 会写入）" />
      <el-table v-else :data="data.sources">
        <el-table-column prop="id" label="采集源" min-width="180" />
        <el-table-column prop="events" label="事件数" width="110" sortable />
        <el-table-column prop="files" label="文件数" width="110" sortable />
        <el-table-column label="最近采集" width="180">
          <template #default="{ row }">{{ formatDate(row.lastRunAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
    <el-card shadow="never" class="block">
      <template #header>distill 提纯水位线</template>
      <template v-if="data.distill">
        <p>
          已纳入提纯游标的文件：<b>{{ data.distill.filesTracked }}</b> 个 ·
          最近提纯：<b>{{ formatDate(data.distill.lastRunAt) }}</b>
        </p>
        <div class="muted">水位线保证 learn --auto 增量提纯，不重扫全量 inbox。</div>
      </template>
      <el-empty v-else description="还没有提纯水位线（首次 learn --auto 运行后生成）" :image-size="60" />
    </el-card>
  </template>
</template>

<style scoped>
.tip { margin-bottom: 16px; }
.block { margin-bottom: 16px; }
.muted { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
