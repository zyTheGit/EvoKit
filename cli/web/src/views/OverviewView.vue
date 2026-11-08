<script setup>
// 总览：四区计数 + 入口同步摘要 + 索引规模 + 最近入库提交
import { useList } from '../composables/useApi';
import CountCard from '../components/CountCard.vue';
import StatusTag from '../components/StatusTag.vue';
import { formatDate } from '../composables/useApi';

const { data, loading, error } = useList('/api/overview');
</script>

<template>
  <el-skeleton v-if="loading" :rows="6" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <template v-else-if="data">
    <el-row :gutter="16">
      <el-col :span="6"><count-card label="已入库" :count="data.counts?.confirmed" tone="success" hint="knowledge/ confirmed" /></el-col>
      <el-col :span="6"><count-card label="待审草稿" :count="data.counts?.pending" tone="warning" hint=".pending/ 待 review" /></el-col>
      <el-col :span="6"><count-card label="已归档" :count="data.counts?.archive" tone="info" hint=".archive/ retired" /></el-col>
      <el-col :span="6"><count-card label="已拒绝" :count="data.counts?.rejected" tone="danger" hint=".rejected/" /></el-col>
    </el-row>

    <el-row :gutter="16" class="block">
      <el-col :span="12">
        <el-card shadow="never" class="fill">
          <template #header>入口同步状态（与 evokit check 同口径）</template>
          <div class="sync-line">
            <status-tag status="consistent" /> 一致 <b>{{ data.syncSummary?.consistent ?? 0 }}</b>
            <el-divider direction="vertical" />
            <status-tag status="drifted" /> 漂移 <b>{{ data.syncSummary?.drifted ?? 0 }}</b>
            <el-divider direction="vertical" />
            <status-tag status="missing" /> 缺失 <b>{{ data.syncSummary?.missing ?? 0 }}</b>
          </div>
          <div class="ops"><router-link to="/sync"><el-button size="small" link type="primary">查看三入口明细 →</el-button></router-link></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" class="fill">
          <template #header>知识索引</template>
          <p class="big">{{ data.indexEntries ?? 0 }} <span class="muted">行索引条目</span></p>
          <div class="ops"><router-link to="/index"><el-button size="small" link type="primary">查看索引 →</el-button></router-link></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="block">
      <template #header>最近知识库提交</template>
      <template v-if="data.lastKnowledgeCommit">
        <code class="hash">{{ data.lastKnowledgeCommit.hash.slice(0, 8) }}</code>
        <span class="subject">{{ data.lastKnowledgeCommit.subject }}</span>
        <span class="muted">{{ formatDate(data.lastKnowledgeCommit.date) }}</span>
      </template>
      <span v-else class="muted">知识根尚未 git 初始化（evokit knowledge init 会创建）</span>
      <div class="ops"><router-link to="/history"><el-button size="small" link type="primary">变更历史 →</el-button></router-link></div>
    </el-card>
  </template>
</template>

<style scoped>
.block { margin-top: 16px; }
.fill { height: 100%; }
.sync-line { display: flex; align-items: center; gap: 8px; }
.big { font-size: 28px; font-weight: 700; margin: 6px 0; }
.subject { margin-left: 8px; }
.ops { margin-top: 8px; }
.hash { background: var(--el-fill-color); padding: 1px 6px; border-radius: 4px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; margin-left: 8px; }
</style>
