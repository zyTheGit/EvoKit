// web 命令（M7）：本机只读知识库控制台
// 软依赖设计（技术设计 D1）：h3 仅由本命令经动态 import 间接加载；加载失败给出安装提示并退出，
// CLI 其余命令不受 cli/node_modules 是否存在影响。

import { spawn } from 'node:child_process';

/**
 * `evokit web [--port <n>] [--open]` 入口
 * @param {string[]} args 参数（不含 'web' 本身）
 */
export async function webCommand(args) {
  // ── 参数解析：--port <n>（显式端口被占时报错退出，由 server 层负责）──
  let port;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1) {
    const raw = args[portIdx + 1];
    const n = Number(raw);
    if (raw === undefined || !Number.isInteger(n) || n < 1 || n > 65535) {
      console.error(`✗ --port 需要一个 1-65535 的整数，当前为「${raw ?? ''}」`);
      process.exitCode = 1;
      return;
    }
    port = n;
  }
  const open = args.includes('--open');

  // ── 软依赖：动态加载服务端装配模块（其内部静态 import h3）──
  let serverModule;
  try {
    serverModule = await import('../web/server.js');
  } catch (err) {
    console.error('✗ evokit web 需要服务端依赖，尚未安装。');
    console.error('  请在 cli/ 目录执行：npm install');
    console.error(`  （加载失败：${err instanceof Error ? err.message : String(err)}）`);
    process.exitCode = 1;
    return;
  }

  // ── 启动：server 保持监听，进程随之常驻（Ctrl+C 由 server 层优雅关闭）──
  try {
    const { url } = await serverModule.startServer({ port });
    console.log(`EvoKit 知识库网页端已启动：${url}`);
    console.log('只读模式：浏览与检索不会改动 ~/.evokit 任何数据。Ctrl+C 停止。');
    if (open) openBrowser(url);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

/** 尝试用系统默认浏览器打开 URL（失败仅提示，不影响服务） */
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const bin = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(bin, [url], { detached: true, stdio: 'ignore' }).unref();
    }
    console.log('已尝试在默认浏览器打开。');
  } catch {
    console.log('（自动打开浏览器失败，请手动访问上面的地址）');
  }
}
