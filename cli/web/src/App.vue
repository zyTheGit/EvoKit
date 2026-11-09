<script setup>
// 应用骨架：左侧导航（两组：内容 / 运行与操作）+ 顶部标题 + 主内容区
import { useRoute } from 'vue-router';
import zhCn from 'element-plus/es/locale/lang/zh-cn';

const route = useRoute();

// 菜单分组收敛（2026-11-08 用户反馈「菜单太过分散」）：13 项平铺 → 2 组 11 项
// 知识卡四区（已入库/待审/归档/拒绝）收敛进「知识卡」页内 tab，不再单列三个菜单
const menuGroups = [
  {
    label: '内容',
    items: [
      { path: '/', label: '总览' },
      { path: '/context', label: '全局偏好' },
      { path: '/index', label: '知识索引' },
      { path: '/cards', label: '知识卡' },
      { path: '/search', label: '检索' },
    ],
  },
  {
    label: '运行与操作',
    items: [
      { path: '/sync', label: '同步状态' },
      { path: '/skills', label: '技能同步' },
      { path: '/history', label: '变更历史' },
      { path: '/recall-stats', label: '召回统计' },
      { path: '/reports', label: '报告库' },
      { path: '/inbox', label: '采集概览' },
      { path: '/run', label: '命令执行' },
      { path: '/settings', label: '设置编辑' },
    ],
  },
];
</script>

<template>
  <el-config-provider :locale="zhCn">
    <el-container class="layout">
      <el-aside width="200px" class="aside">
        <div class="brand">EvoKit 知识库</div>
        <el-menu :default-active="route.path" router class="menu">
          <el-menu-item-group v-for="group in menuGroups" :key="group.label" :title="group.label">
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">
              {{ item.label }}
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
        <div class="footnote">只读浏览 · 命令白名单执行<br />本机 127.0.0.1</div>
      </el-aside>
      <el-container>
        <el-header class="header">
          <span class="page-title">{{ route.meta?.title ?? '' }}</span>
          <span class="page-sub">裁决等写操作走「命令执行」页或 evokit CLI</span>
        </el-header>
        <el-main class="main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </el-config-provider>
</template>

<style scoped>
.layout { height: 100vh; background: var(--el-bg-color); }
.aside { display: flex; flex-direction: column; border-right: 1px solid var(--el-border-color-light); background: var(--el-bg-color); }
.brand {
  font-weight: 700;
  font-size: 16px;
  padding: 16px;
  background: linear-gradient(90deg, var(--el-color-primary), var(--el-color-primary-light-3));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: 0.5px;
}
.menu { border-right: none; flex: 1; }
.menu :deep(.el-menu-item) { border-radius: 6px; margin: 2px 8px; height: 40px; }
.menu :deep(.el-menu-item.is-active) { background: var(--el-color-primary-light-9); }
.menu :deep(.el-menu-item-group__title) { font-size: 12px; color: var(--el-text-color-secondary); padding: 10px 16px 4px; }
.footnote { padding: 12px 16px; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); background: var(--el-bg-color); }
.header { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--el-border-color-light); background: var(--el-bg-color); }
.page-title { font-size: 18px; font-weight: 600; }
.page-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.main { background: var(--el-fill-color-lighter); overflow: auto; }
</style>
