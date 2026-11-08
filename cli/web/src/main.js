// 前端入口：挂载 App + 路由；Element Plus 全量样式一次引入
// （JS 组件由 unplugin-vue-components 按需注册；全量 CSS 保证 ElMessage 等命令式组件样式可用）
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import 'element-plus/dist/index.css';

createApp(App).use(router).mount('#app');
