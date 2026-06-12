#!/usr/bin/env node
// EvoKit CLI — Self-Evolving System Framework
// Priority: dist/ (production) → tsx (development)

const { resolve } = require('path');

async function resolveCLI() {
  try {
    const distPath = resolve(__dirname, '../dist/cli.js');
    await import(distPath);
  } catch (err) {
    try {
      // Development fallback via tsx
      require('tsx/cli');
      const tsxPath = resolve(__dirname, '../src/cli.ts');
      require(tsxPath);
    } catch {
      console.error(
        'EvoKit: Could not find compiled CLI. Run "npm run build" first, ' +
        'or install tsx for development mode.'
      );
      process.exit(1);
    }
  }
}

resolveCLI().catch(() => process.exit(1));
