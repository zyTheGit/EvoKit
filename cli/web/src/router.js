// 路由表（D8 模块化）：一页一视图，全部懒加载（每页独立 chunk）
// hash 模式（createWebHashHistory）：静态托管无需 history fallback，深链可靠
// 旧三分区路由 /pending /archive /rejected 重定向到 /cards?zone=…（菜单收敛为单「知识卡」项 + 页内 tab）
import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'overview', component: () => import('./views/OverviewView.vue'), meta: { title: '总览' } },
  { path: '/context', name: 'context', component: () => import('./views/ContextView.vue'), meta: { title: '全局偏好' } },
  { path: '/index', name: 'index', component: () => import('./views/IndexView.vue'), meta: { title: '知识索引' } },
  { path: '/cards', name: 'cards', component: () => import('./views/CardsView.vue'), meta: { title: '知识卡' } },
  { path: '/cards/:id', name: 'card-detail', component: () => import('./views/CardDetailView.vue'), props: true, meta: { title: '卡片详情' } },
  { path: '/pending', redirect: { path: '/cards', query: { zone: 'pending' } } },
  { path: '/archive', redirect: { path: '/cards', query: { zone: 'archive' } } },
  { path: '/rejected', redirect: { path: '/cards', query: { zone: 'rejected' } } },
  { path: '/search', name: 'search', component: () => import('./views/SearchView.vue'), meta: { title: '检索' } },
  { path: '/sync', name: 'sync', component: () => import('./views/SyncView.vue'), meta: { title: '同步状态' } },
  { path: '/history/:id?', name: 'history', component: () => import('./views/HistoryView.vue'), props: true, meta: { title: '变更历史' } },
  { path: '/recall-stats', name: 'recall-stats', component: () => import('./views/RecallStatsView.vue'), meta: { title: '召回统计' } },
  { path: '/reports', name: 'reports', component: () => import('./views/ReportsView.vue'), meta: { title: '报告库' } },
  { path: '/reports/:name', name: 'report-detail', component: () => import('./views/ReportDetailView.vue'), props: true, meta: { title: '报告阅读' } },
  { path: '/inbox', name: 'inbox', component: () => import('./views/InboxView.vue'), meta: { title: '采集概览' } },
  { path: '/run', name: 'run', component: () => import('./views/CommandRunView.vue'), meta: { title: '命令执行' } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 页面标题跟随路由
router.afterEach((to) => {
  const title = to.meta?.title;
  document.title = title ? `${title} · EvoKit 知识库` : 'EvoKit 知识库';
});

export default router;
