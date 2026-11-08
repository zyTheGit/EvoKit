<script setup>
// 应用骨架：左侧导航（13 项，与路由一一对应）+ 顶部标题 + 主内容区
import { useRoute } from 'vue-router';
import zhCn from 'element-plus/es/locale/lang/zh-cn';

const route = useRoute();

// 菜单项与路由表一一对应；el-menu router 模式下 index 即跳转路径
const menu = [
  { path: '/', label: '总览' },
  { path: '/context', label: '全局偏好' },
  { path: '/index', label: '知识索引' },
  { path: '/cards', label: '知识卡' },
  { path: '/pending', label: '待审草稿' },
  { path: '/archive', label: '已归档' },
  { path: '/rejected', label: '已拒绝' },
  { path: '/search', label: '检索' },
  { path: '/sync', label: '同步状态' },
  { path: '/history', label: '变更历史' },
  { path: '/recall-stats', label: '召回统计' },
  { path: '/reports', label: '报告库' },
  { path: '/inbox', label: '采集概览' },
];
</script>

<template>
  <el-config-provider :locale="zhCn">
    <el-container class="layout">
      <el-aside width="200px" class="aside">
        <div class="brand">EvoKit 知识库</div>
        <el-menu :default-active="route.path" router class="menu">
          <el-menu-item v-for="item in menu" :key="item.path" :index="item.path">
            {{ item.label }}
          </el-menu-item>
        </el-menu>
        <div class="footnote">只读模式 · 本机 127.0.0.1</div>
      </el-aside>
      <el-container>
        <el-header class="header">
          <span class="page-title">{{ route.meta?.title ?? '' }}</span>
          <span class="page-sub">写操作（review 裁决等）请使用 evokit CLI</span>
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
.brand { font-weight: 700; font-size: 16px; padding: 16px; color: var(--el-color-primary); }
.menu { border-right: none; flex: 1; }
.footnote { padding: 12px 16px; font-size: 12px; color: var(--el-text-color-secondary); background: var(--el-bg-color); }
.header { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--el-border-color-light); background: var(--el-bg-color); }
.page-title { font-size: 18px; font-weight: 600; }
.page-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.main { background: var(--el-fill-color-lighter); overflow: auto; }
</style>
