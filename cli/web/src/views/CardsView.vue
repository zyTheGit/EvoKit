<script setup>
// 知识卡：四区合一（已入库表格 + 待审/归档/拒绝卡片列表），tab 与路由 query.zone 双向同步
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useList, formatDate } from '../composables/useApi';
import CardMeta from '../components/CardMeta.vue';
import ZoneCardList from '../components/ZoneCardList.vue';

const route = useRoute();
const router = useRouter();

// ── 四区 tab（2026-11-08 菜单收敛：待审/归档/拒绝并入本页，不再单列菜单）──
const ZONES = [
  { name: 'confirmed', label: '已入库' },
  { name: 'pending', label: '待审草稿' },
  { name: 'archive', label: '已归档' },
  { name: 'rejected', label: '已拒绝' },
];
const activeZone = ref(['confirmed', 'pending', 'archive', 'rejected'].includes(route.query.zone) ? route.query.zone : 'confirmed');
watch(() => route.query.zone, (z) => {
  if (['confirmed', 'pending', 'archive', 'rejected'].includes(z)) activeZone.value = z;
});
function onTabChange(name) {
  router.replace({ query: name === 'confirmed' ? {} : { zone: name } });
}

// ── 已入库区：筛选 + 表格 ──
// 镜像自 cli/src/knowledge-cards.js CARD_TYPES（前端不能直接复用后端模块）
const TYPES = [
  { value: 'fact', label: '事实' },
  { value: 'preference', label: '偏好' },
  { value: 'pattern', label: '模式' },
  { value: 'pitfall', label: '避坑' },
  { value: 'workflow', label: '工作流' },
];

const query = reactive({ type: '', tag: '', sort: 'updated' });

const path = computed(() => {
  const params = new URLSearchParams();
  if (query.type) params.set('type', query.type);
  if (query.tag) params.set('tag', query.tag);
  if (query.sort) params.set('sort', query.sort);
  const qs = params.toString();
  return `/api/cards${qs ? `?${qs}` : ''}`;
});

const { data, loading, error, reload } = useList(() => path.value);
watch(path, reload);

const tagOptions = computed(() => {
  const set = new Set();
  for (const c of data.value?.cards ?? []) {
    const tags = Array.isArray(c.front?.tags) ? c.front.tags : (c.front?.tags ? [c.front.tags] : []);
    for (const t of tags) set.add(String(t));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
});

function typeLabel(type) {
  return TYPES.find((t) => t.value === type)?.label ?? String(type ?? '-');
}

const ZONE_ENDPOINTS = { pending: '/api/pending', archive: '/api/archive', rejected: '/api/rejected' };
const ZONE_EMPTY = {
  pending: '没有待审草稿，learn 产出草稿后会出现在这里',
  archive: '没有已归档卡，knowledge gc 会把失效卡移入 .archive',
  rejected: '没有已拒绝卡，review --reject 的卡片会保存在 .rejected',
};
</script>

<template>
  <el-tabs v-model="activeZone" class="zone-tabs" @tab-change="onTabChange">
    <el-tab-pane v-for="z in ZONES" :key="z.name" :name="z.name">
      <template #label>{{ z.label }}</template>

      <!-- 已入库：筛选 + 表格 -->
      <template v-if="z.name === 'confirmed'">
        <el-card shadow="never" class="filter">
          <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 140px">
            <el-option v-for="t in TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-select v-model="query.tag" placeholder="全部标签" clearable style="width: 160px; margin-left: 8px">
            <el-option v-for="t in tagOptions" :key="t" :label="`#${t}`" :value="t" />
          </el-select>
          <el-radio-group v-model="query.sort" style="margin-left: 16px">
            <el-radio-button value="updated">按更新时间</el-radio-button>
            <el-radio-button value="title">按标题</el-radio-button>
          </el-radio-group>
          <span class="total">共 {{ data?.cards?.length ?? 0 }} 张</span>
        </el-card>
        <el-skeleton v-if="loading" :rows="5" animated />
        <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
        <el-empty v-else-if="!data?.cards?.length" description="没有符合条件的已入库卡" />
        <el-table v-else :data="data.cards">
          <el-table-column label="标题" min-width="280">
            <template #default="{ row }">
              <router-link :to="`/cards/${encodeURIComponent(row.id)}`">
                <el-button link type="primary">{{ row.front?.title ?? row.id }}</el-button>
              </router-link>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">{{ typeLabel(row.front?.type) }}</template>
          </el-table-column>
          <el-table-column label="标签" min-width="160">
            <template #default="{ row }">
              <el-tag v-for="t in (Array.isArray(row.front?.tags) ? row.front.tags : [])" :key="t" size="small" effect="plain" class="tag">#{{ t }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="90">
            <template #default="{ row }">
              {{ Number.isFinite(Number(row.front?.confidence)) && row.front?.confidence !== '' ? `${Math.round(Number(row.front.confidence) * 100)}%` : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">{{ formatDate(row.front?.updated) }}</template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 三个分区：共用卡片列表（key 触发切 tab 重新拉取） -->
      <template v-else>
        <zone-card-list
          :key="`${z.name}-${refreshKey}`"
          :endpoint="ZONE_ENDPOINTS[z.name]"
          :empty-text="ZONE_EMPTY[z.name]"
          :tip="z.name === 'pending' ? '裁决请用「命令执行」页或卡片详情页的快捷按钮（review --accept / --reject）' : ''"
        />
      </template>
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.zone-tabs :deep(.el-tabs__header) { margin-bottom: 16px; }
.filter { margin-bottom: 16px; }
.filter :deep(.el-card__body) { display: flex; align-items: center; }
.total { margin-left: auto; color: var(--el-text-color-secondary); font-size: 13px; }
.tag { margin-right: 4px; }
</style>
