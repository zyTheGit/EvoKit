<script setup>
// 检索：关键词评分检索，口径与 evokit recall 完全一致（tags×3 ＞ 标题×2 ＞ 正文×1）
import { ref } from 'vue';
import { apiGet } from '../composables/useApi';

const keyword = ref('');
const results = ref(null); // null = 未检索；[] = 无命中
const loading = ref(false);
const error = ref('');

async function doSearch() {
  const q = keyword.value.trim();
  if (!q) {
    error.value = '请输入检索词';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    results.value = await apiGet(`/api/search?q=${encodeURIComponent(q)}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-card shadow="never" class="box">
    <div class="bar">
      <el-input
        v-model="keyword"
        placeholder="检索词（空格分词，如：软链接 sync）"
        clearable
        @keyup.enter="doSearch"
      />
      <el-button type="primary" :loading="loading" @click="doSearch">检索</el-button>
    </div>
    <div class="hint">评分口径与 `evokit recall` 完全一致：tags 全等 ×3 ＞ 标题子串 ×2 ＞ 正文子串 ×1；网页检索不写引用计数。</div>
  </el-card>

  <el-alert v-if="error" type="error" :title="error" :closable="false" class="block" />
  <el-empty v-else-if="results?.length === 0" description="未命中任何已入库卡" />
  <el-table v-else-if="results" :data="results">
    <el-table-column label="标题" min-width="280">
      <template #default="{ row }">
        <router-link :to="`/cards/${encodeURIComponent(row.id)}`">
          <el-button link type="primary">{{ row.title || row.id }}</el-button>
        </router-link>
      </template>
    </el-table-column>
    <el-table-column prop="type" label="类型" width="100" />
    <el-table-column label="评分" width="80">
      <template #default="{ row }">
        <el-tag size="small" :type="row.score >= 3 ? 'success' : row.score === 2 ? 'warning' : 'info'">{{ row.score }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="标签" min-width="160">
      <template #default="{ row }">
        <el-tag v-for="t in row.tags" :key="t" size="small" effect="plain" class="tag">#{{ t }}</el-tag>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.box { margin-bottom: 16px; }
.bar { display: flex; gap: 8px; }
.hint { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.block { margin-bottom: 16px; }
.tag { margin-right: 4px; }
</style>
