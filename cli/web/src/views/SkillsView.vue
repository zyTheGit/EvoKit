<script setup>
// 技能同步（FR-15）：源库（~/.agents/skills）× 各工具 skills 目录的同步矩阵 + 批量更新
// 状态口径见 cli/src/web/api/skills.js 头注释；更新只覆盖「源较新的真实目录副本」，
// conflict（本地改动）/ broken（断链）只报告不自动处理
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useList, apiSend } from '../composables/useApi';

const { data, loading, error, reload } = useList('/api/skills');
const filter = ref('all');
const updating = ref(false);
const updateResult = ref(null);

const STATE_LABEL = {
  linked: '链接',
  'linked-external': '链接(外部)',
  broken: '断链',
  current: '副本一致',
  updatable: '可更新',
  conflict: '本地改动',
  extra: '仅副本',
  missing: '未分发',
  unknown: '未知',
};
const STATE_TYPE = {
  linked: 'success',
  'linked-external': 'warning',
  broken: 'danger',
  current: 'success',
  updatable: 'warning',
  conflict: 'danger',
  extra: 'info',
  missing: 'info',
  unknown: 'info',
};

const filteredRows = computed(() => {
  const rows = data.value?.matrix ?? [];
  if (filter.value === 'updatable') return rows.filter((r) => Object.values(r.perTool).includes('updatable'));
  if (filter.value === 'abnormal') return rows.filter((r) => Object.values(r.perTool).some((s) => ['broken', 'conflict', 'extra', 'linked-external'].includes(s)));
  return rows;
});

async function runUpdate() {
  const n = data.value?.summary?.updatable ?? 0;
  if (n === 0) {
    ElMessage.info('当前没有可更新的副本');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将把 ${n} 处落后于源库的真实目录副本按文件覆盖更新（本地改动 conflict 与断链一律不动，源库文件不会被修改）。继续？`,
      '批量更新技能副本',
      { confirmButtonText: '更新', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  updating.value = true;
  updateResult.value = null;
  try {
    updateResult.value = await apiSend('POST', '/api/skills/update');
    ElMessage.success(`更新完成：${updateResult.value.summary.updatedSkills} 处副本 / ${updateResult.value.summary.writtenFiles} 个文件`);
    await reload();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e));
  } finally {
    updating.value = false;
  }
}
</script>

<template>
  <el-card v-loading="loading" shadow="never" class="box">
    <template #header>
      <div class="head">
        <span>技能同步矩阵</span>
        <span class="meta"><code>{{ data?.source ?? '' }}</code></span>
      </div>
    </template>

    <div class="counts">
      <el-tag effect="plain">技能 {{ data?.summary?.skills ?? '-' }}</el-tag>
      <el-tag effect="plain" type="info">工具目录 {{ data?.summary?.tools ?? '-' }}</el-tag>
      <el-tag effect="dark" type="warning">可更新 {{ data?.summary?.updatable ?? '-' }}</el-tag>
      <el-tag effect="plain" type="danger">断链 {{ data?.summary?.broken ?? '-' }}</el-tag>
      <el-tag effect="plain" type="danger">本地改动 {{ data?.summary?.conflict ?? '-' }}</el-tag>
      <el-button
        type="primary"
        size="small"
        class="update-btn"
        :loading="updating"
        :disabled="(data?.summary?.updatable ?? 0) === 0"
        @click="runUpdate"
      >批量更新</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="链接 = junction/symlink，内容自动跟随源库；副本 = 真实目录，落后于源库时标记「可更新」。「批量更新」只覆盖源较新的文件，不删副本多余文件；本地改动（conflict）与断链不会被自动处理。forge 生成的技能带 evokit 标签。"
    />

    <div class="filter-bar">
      <el-radio-group v-model="filter" size="small">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="updatable">仅可更新</el-radio-button>
        <el-radio-button value="abnormal">仅异常</el-radio-button>
      </el-radio-group>
    </div>

    <el-table :data="filteredRows" size="small" class="matrix" empty-text="无匹配条目">
      <el-table-column label="技能" min-width="230" fixed>
        <template #default="{ row }">
          <span class="skill-name">{{ row.name }}</span>
          <el-tag v-if="row.forge" size="small" type="success" effect="plain" class="forge-tag">evokit</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-for="t in (data?.tools ?? [])" :key="t.dir" :label="t.label" min-width="110">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="STATE_TYPE[row.perTool[t.dir]] ?? 'info'"
            :effect="['updatable', 'broken', 'conflict'].includes(row.perTool[t.dir]) ? 'dark' : 'plain'"
          >{{ STATE_LABEL[row.perTool[t.dir]] ?? row.perTool[t.dir] }}</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <pre v-if="updateResult" class="result">{{ JSON.stringify(updateResult, null, 2) }}</pre>
  </el-card>
</template>

<style scoped>
.box { margin-bottom: 16px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.meta { font-size: 12px; color: var(--el-text-color-secondary); }
.meta code { background: var(--el-fill-color); padding: 1px 6px; border-radius: 4px; }
.counts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.update-btn { margin-left: auto; }
.tip { margin-bottom: 12px; }
.filter-bar { margin-bottom: 10px; }
.matrix { width: 100%; }
.skill-name { font-family: Consolas, 'Courier New', monospace; font-size: 12.5px; }
.forge-tag { margin-left: 6px; }
.result {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  padding: 12px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  margin-top: 12px;
  max-height: 320px;
  overflow: auto;
}
</style>
