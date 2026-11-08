<script setup>
// 召回统计：references.jsonl 聚合可视化（按卡 Top 柱状 + 按日趋势折线），ECharts 按需引入
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useList } from '../composables/useApi';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const { data, loading, error } = useList('/api/recall-stats');

const cardRef = ref(null);
const dayRef = ref(null);
let cardChart = null;
let dayChart = null;

function draw() {
  if (!data.value) return;
  if (cardRef.value) {
    cardChart?.dispose();
    cardChart = echarts.init(cardRef.value);
    const top = data.value.byCard.slice(0, 10); // Top 10，其余聚合意义有限
    cardChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: top.map((x) => x.title || x.cardId).reverse() },
      series: [{ type: 'bar', data: top.map((x) => x.count).reverse(), itemStyle: { color: '#409eff' } }],
    });
  }
  if (dayRef.value) {
    dayChart?.dispose();
    dayChart = echarts.init(dayRef.value);
    dayChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: data.value.byDay.map((x) => x.day) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'line', data: data.value.byDay.map((x) => x.count), smooth: true, itemStyle: { color: '#67c23a' } }],
    });
  }
}

watch([() => data.value, () => loading.value], ([d, l]) => {
  if (d && !l) nextTick(draw);
});
onBeforeUnmount(() => {
  cardChart?.dispose();
  dayChart?.dispose();
});
</script>

<template>
  <el-skeleton v-if="loading" :rows="6" animated />
  <el-alert v-else-if="error" type="error" :title="error" :closable="false" />
  <el-empty v-else-if="!data?.total" description="还没有召回记录（references.jsonl 为空；evokit recall 命中会记入）" />
  <template v-else>
    <el-alert type="info" :closable="false" class="tip" :title="`共 ${data.total} 条召回事件 · 覆盖 ${data.byCard.length} 张卡 · 统计口径含 recall/l2/review-update/forge-use 全类型`" />
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>按卡命中 Top 10</template>
          <div ref="cardRef" class="chart" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>按日召回趋势</template>
          <div ref="dayRef" class="chart" />
        </el-card>
      </el-col>
    </el-row>
  </template>
</template>

<style scoped>
.tip { margin-bottom: 16px; }
.chart { height: 320px; }
</style>
