// Vite 配置（网页端技术设计 §5/§6）：产物输出到 cli/web-dist（入库随 npm files 发布）；
// dev 模式经 proxy 把 /api 转发到本机 evokit web 服务；组件按需注册（ElementPlusResolver）。
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    Components({ resolvers: [ElementPlusResolver()], dts: false }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:4177' },
  },
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
});
