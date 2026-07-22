#!/usr/bin/env node
/**
 * postinstall-check.cjs — npm 安装后钩子，检测 PATH 问题。
 *
 * 在 `npm install @zythegit/evokit` 之后，检查 `evokit` CLI
 * 是否在 PATH 上，并为不同的安装场景提供相应指引
 *（全局与本地、PATH 已配置与否、fnm 环境）。
 */
const { execSync } = require('child_process');
const path = require('path');

function which(cmd) {
  try {
    const result = execSync(`command -v ${cmd} 2>/dev/null || which ${cmd} 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 3000,
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function npmGlobalBin() {
  try {
    const root = execSync('npm root -g', { encoding: 'utf-8', stdio: 'pipe', timeout: 3000 }).trim();
    return path.resolve(root, '..', 'bin');
  } catch {
    return null;
  }
}

function isFnmEnvironment() {
  // fnm sets FNM_MULTISHELL_PATH, or the npm path contains "fnm_multishells"
  if (process.env.FNM_MULTISHELL_PATH) return true;
  if (process.env.FNM_PATH) return true;
  try {
    const npmPath = execSync('which npm 2>/dev/null || where npm 2>/dev/null', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 3000,
    }).trim();
    return npmPath.includes('fnm_multishells') || npmPath.includes('fnm');
  } catch {
    return false;
  }
}

function main() {
  const evokitPath = which('evokit');

  if (evokitPath) {
    console.log('');
    console.log('  ✅ EvoKit 安装成功！运行 `evokit init` 开始使用。');
    if (isFnmEnvironment()) {
      console.log('');
      console.log('  ⚠ 检测到 fnm：如果在新终端中 `evokit` 失效，');
      console.log('    请使用 `npx evokit` 替代，或运行 `fnm install` 刷新 shim。');
    }
    console.log('');
    return;
  }

  // 检查是否为全局安装
  const isGlobal = process.argv[1] && (
    process.argv[1].includes('/lib/node_modules/@zythegit/evokit/') ||
    process.argv[1].includes('/lib/node_modules/.pnpm/@zythegit+evokit@') ||
    process.argv[1].includes('\\node_modules\\@zythegit\\evokit\\')
  );

  const globalBin = npmGlobalBin();

  if (isGlobal && globalBin) {
    // 全局安装但 evokit 不在 PATH 上
    console.log('');
    console.log('  ⚠ EvoKit 已全局安装，但 evokit 命令不在您的 PATH 中。');
    console.log('');
    if (isFnmEnvironment()) {
      console.log('  检测到 fnm — multishell PATH 可能不包含 shim。');
      console.log('  建议：改用 npx');
      console.log('    npx evokit init');
      console.log('');
      console.log('  或刷新 fnm shim：');
      console.log('    fnm install');
    } else {
      console.log(`  请将以下内容添加到您的 shell 配置中：`);
      console.log(`    export PATH="${globalBin}:$PATH"`);
      console.log('');
      console.log('  或改用 npx：');
      console.log('    npx evokit init');
    }
    console.log('');
  } else {
    // 本地安装或未知
    console.log('');
    console.log('  ✅ EvoKit 安装成功！');
    console.log('');
    console.log('  使用 CLI：');
    console.log('    npx evokit init');
    console.log('');
    console.log('  或全局安装：');
    console.log('    npm install -g @zythegit/evokit');
    console.log('');
  }
}

main();
