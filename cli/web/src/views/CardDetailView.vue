<script setup>
// 卡片详情：front 全字段 + 正文渲染 + 召回次数 + 单卡历史入口
import { watch, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useList, formatDate, execCommand } from '../composables/useApi';
import MarkdownView from '../components/MarkdownView.vue';

const props = defineProps({
  id: { type: String, required: true },
});

const { data, loading, error, reload } = useList(() => `/api/cards/${encodeURIComponent(props.id)}`);
watch(() => props.id, reload);

// 待审草稿快捷裁决（FR-13）：网页上直接执行 review --accept / --reject（confirm 类命令，先二次确认）
const reviewing = ref(false);
async function reviewDraft(action) {
  const actionLabel = action === 'accept' ? '通过入库' : '拒绝';
  try {
    await ElMessageBox.confirm(
      `确认对草稿「${data.value?.front?.title ?? props.id}」执行 review --${action}？该操作会产生实际改动（入库/移入 .rejected）。`,
      `确认${actionLabel}`,
      { confirmButtonText: actionLabel, cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return; // 用户取消
  }
  reviewing.value = true;
  try {
    const r = await execCommand('review', [`--${action}`, props.id]);
    if (r.exitCode === 0) {
      ElMessage.success(`${actionLabel}完成（${(r.durationMs / 1000).toFixed(1)}s）`);
      reload();
    } else {
      ElMessage.error(`退出码 ${r.exitCode}：${(r.stderr || r.stdout || '').slice(-300)}`);
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e));
  } finally {
    reviewing.value = false;
  }
}

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
      <template #header>
        <div class="head-row">
          <span>元数据（frontmatter 全字段）</span>
          <span v-if="data.zone === '待审草稿'" class="quick-ops">
            <el-button type="success" size="small" :loading="reviewing" @click="reviewDraft('accept')">通过入库</el-button>
            <el-button type="danger" size="small" :loading="reviewing" @click="reviewDraft('reject')">拒绝</el-button>
          </span>
        </div>
      </template>
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
.head-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.quick-ops { display: flex; gap: 8px; }
.field { word-break: break-all; }
.muted { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
