#!/usr/bin/env node
// EvoKit CLI — Self-Evolving System Framework
// Priority: dist/ (production) → tsx (development)

const { resolve } = require('path');
const { pathToFileURL } = require('url');
const { existsSync } = require('fs');

async function resolveCLI() {
  // Try production build first
  const distPath = resolve(__dirname, '../dist/cli.js');

  if (existsSync(distPath)) {
    try {
      // pathToFileURL is required on Windows: import() only accepts
      // file:// URLs, but resolve() returns bare paths (e.g. C:\…)
      // which ESM interprets as a protocol, causing
      // "Only URLs with a scheme in: file, data, and node are supported"
      await import(pathToFileURL(distPath).href);
      return;
    } catch (err) {
      if (err instanceof Error) {
        console.error('EvoKit: Failed to load CLI —', err.message);
      }
    }
  }

  // Development fallback via tsx
  try {
    require('tsx/cli');
    const tsxPath = resolve(__dirname, '../src/cli.ts');
    require(tsxPath);
  } catch {
    // Distinguish between actual version issues and other failures
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
