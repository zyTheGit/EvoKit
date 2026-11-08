<script setup>
// 卡片详情：front 全字段 + 正文渲染 + 召回次数 + 单卡历史入口
import { watch } from 'vue';
import { useList, formatDate } from '../composables/useApi';
import MarkdownView from '../components/MarkdownView.vue';

const props = defineProps({
  id: { type: String, required: true },
});

const { data, loading, error, reload } = useList(() => `/api/cards/${encodeURIComponent(props.id)}`);
watch(() => props.id, reload);

// front 动态字段展平展示（未知键保留是知识库写入纪律，详情页全量透出）
const fields = computed2();
function computed2() {
  return {
    get value() {
      const front = data.value?.front ?? {};
      return Object.entries(front).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value.join('、') : String(value ?? ''),
      }));
    },
  };
}
</script>

<template>
  <el-skeleton v-if="loading" :rows="7" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false">
    <router-link to="/cards"><el-button size="small" link>返回知识卡列表</el-button></router-link>
  </el-alert>
  <template v-else-if="data">
    <div class="head">
      <el-tag>{{ data.zone }}</el-tag>
      <el-tag v-if="data.recallHits > 0" type="warning" effect="plain">recall 命中 {{ data.recallHits }} 次</el-tag>
      <router-link v-if="data.hasGit" :to="`/history/${encodeURIComponent(data.id)}`">
        <el-button size="small" link type="primary">查看该卡修订历史 →</el-button>
      </router-link>
      <router-link to="/cards" class="back">
        <el-button size="small" link>← 返回列表</el-button>
      </router-link>
    </div>

    <el-card shadow="never" class="block">
      <template #header>元数据（frontmatter 全字段）</template>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item v-for="f in fields.value" :key="f.key" :label="f.key">
          <span class="field">{{ f.value }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <div class="muted">来源路径：{{ data.file }}</div>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>正文</template>
      <MarkdownView :source="data.body || '（无正文）'" />
    </el-card>
  </template>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.back { margin-left: auto; }
.block { margin-bottom: 16px; }
.field { word-break: break-all; }
.muted { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
