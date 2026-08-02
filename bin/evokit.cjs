#!/usr/bin/env node
// EvoKit CLI — 项目上下文引擎
// 优先级: dist/（生产） → tsx（开发）

const { resolve } = require('path');
const { pathToFileURL } = require('url');
const { existsSync, readFileSync } = require('fs');

// ─── 快速路径：-V / --version / -h / --help / 未知命令 ──────────────────────────────
// 避免加载整个模块链（适配器、安装、知识库等），仅读取 package.json 即可输出版本号。

function handleQuickCommands() {
  const args = process.argv.slice(2);
  const hasVersionFlag = args.includes('-V') || args.includes('--version');
  const hasHelpFlag = args.includes('-h') || args.includes('--help');

  if (hasVersionFlag) {
    const pkgPath = resolve(__dirname, '../package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      console.log(pkg.version);
      process.exit(0);
    }
  }

  if (hasHelpFlag && args.length === 1) {
    // 仅 --help 无子命令时，输出简短帮助后退出
    console.log(`
EvoKit — AI 编程助手的项目上下文引擎

Usage: evokit <command> [options]

Commands:
  install <适配器>     安装 EvoKit 到指定 AI 编程助手
  uninstall <适配器>   卸载指定 AI 编程助手的 EvoKit
  update [适配器]      更新已安装适配器的模板文件
  init                 install 的别名（向后兼容）
  project              生成项目规范文件
  doctor               验证系统完整性
  migrate              迁移旧数据为 v1.0 知识条目格式
  export               导出 EvoKit 系统状态（v1.0 暂不可用）
  import <压缩包>      导入 EvoKit 系统状态（v1.0 暂不可用）

Run 'evokit <command> --help' for more information on a command.
`);
    process.exit(0);
  }

  // 未知命令快速失败 — 避免加载整个模块链
  if (args.length > 0 && !hasHelpFlag && !hasVersionFlag) {
    const knownCommands = [
      'install', 'uninstall', 'update', 'init', 'project',
      'doctor', 'migrate', 'export', 'import',
      'review', 'boot', 'learn',
    ];
    const cmd = args[0];
    if (!cmd.startsWith('-') && !knownCommands.includes(cmd)) {
      console.error(`evokit: 未知命令 "${cmd}"。运行 'evokit --help' 查看可用命令。`);
      process.exit(1);
    }
  }
}

handleQuickCommands();

async function resolveCLI() {
  // 优先尝试生产构建
  const distPath = resolve(__dirname, '../dist/cli.js');

  if (existsSync(distPath)) {
    try {
      // pathToFileURL 在 Windows 上是必需的：import() 只接受
      // file:// URL，但 resolve() 返回裸路径（如 C:\…）
      // ESM 会将其解释为协议，导致
      // "Only URLs with a scheme in: file, data, and node are supported"
      await import(pathToFileURL(distPath).href);
      return;
    } catch (err) {
      if (err instanceof Error) {
        console.error('EvoKit: 无法加载 CLI —', err.message);
      }
    }
  }

  // 通过 tsx 的开发回退
  try {
    require('tsx/cli');
    const tsxPath = resolve(__dirname, '../src/cli.ts');
    require(tsxPath);
  } catch {
    // 区分实际的版本问题与其他故障
    const nodeVersion = process.versions.node;
    const [major, minor] = nodeVersion.split('.').map(Number);
    const tooOld = major < 20 || (major === 20 && minor < 12);

    if (tooOld) {
      console.error(
        '\n' +
        '╔═══════════════════════════════════════════╗\n' +
        '║     ❌  Node.js 版本过低 / Too Old        ║\n' +
        '╚═══════════════════════════════════════════╝\n' +
        '\n' +
        '   当前版本 / Current: ' + process.version + '\n' +
        '   需要版本 / Required: Node.js >= 20.12.0\n' +
        '\n' +
        '   ── 升级方法 / Upgrade ──\n' +
        '   用 fnm:   fnm install 22  &&  fnm use 22\n' +
        '   下载:     https://nodejs.org/en/download/\n'
      );
    } else {
      console.error(
        '\n' +
        '╔═══════════════════════════════════════════════════════╗\n' +
        '║     ❌  无法加载 EvoKit / Failed to load EvoKit      ║\n' +
        '╚═══════════════════════════════════════════════════════╝\n' +
        '\n' +
        '   Node.js: ' + process.version + ' (满足要求 / meets requirement)\n' +
        '   平台 / Platform: ' + process.platform + '\n' +
        '\n' +
        '   可能原因 / Possible causes:\n' +
        '   1. 安装不完整 — 尝试重新安装 / Incomplete install — try reinstalling\n' +
        '      npm install -g @zythegit/evokit\n' +
        '   2. dist/ 目录缺失 — 需要重新构建 / Missing dist/ — needs rebuild\n' +
        '\n' +
        '   如果问题持续，请提交 issue / If persists, file an issue:\n' +
        '   https://github.com/zyTheGit/EvoKit/issues\n'
      );
    }
    process.exit(1);
  }
}

resolveCLI().catch(() => process.exit(1));
