#!/usr/bin/env node
// EvoKit CLI — Self-Evolving System Framework
// Priority: dist/ (production) → tsx (development)

const { resolve } = require('path');

async function resolveCLI() {
  try {
    const distPath = resolve(__dirname, '../dist/cli.js');
    await import(distPath);
  } catch (err) {
    // Log the real error so users can diagnose (e.g. Node version mismatch)
    if (err instanceof Error) {
      console.error('EvoKit: Failed to load CLI —', err.message);
    }
    try {
      // Development fallback via tsx
      require('tsx/cli');
      const tsxPath = resolve(__dirname, '../src/cli.ts');
      require(tsxPath);
    } catch {
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
      process.exit(1);
    }
  }
}

resolveCLI().catch(() => process.exit(1));
