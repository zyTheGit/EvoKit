#!/usr/bin/env node
/**
 * postinstall-check.cjs — npm postinstall hook to detect PATH issues.
 *
 * After `npm install @zythegit/evokit`, checks if the `evokit` CLI
 * is on PATH and provides appropriate guidance for different install
 * scenarios (global vs local, PATH configured vs not).
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

function main() {
  const evokitPath = which('evokit');

  if (evokitPath) {
    console.log('');
    console.log('  ✅ EvoKit installed! Run `evokit init` to get started.');
    console.log('');
    return;
  }

  // Check if this looks like a global install
  const isGlobal = process.argv[1] && (
    process.argv[1].includes('/lib/node_modules/@zythegit/evokit/') ||
    process.argv[1].includes('/lib/node_modules/.pnpm/@zythegit+evokit@')
  );

  const globalBin = npmGlobalBin();

  if (isGlobal && globalBin) {
    // Global install but evokit not on PATH
    console.log('');
    console.log('  ⚠ EvoKit installed globally, but the evokit command is not on your PATH.');
    console.log('');
    console.log(`  Add this to your shell profile:`);
    console.log(`    export PATH="${globalBin}:$PATH"`);
    console.log('');
    console.log('  Or use npx instead:');
    console.log('    npx evokit init');
    console.log('');
  } else {
    // Local install or unknown
    console.log('');
    console.log('  ✅ EvoKit installed!');
    console.log('');
    console.log('  To use the CLI:');
    console.log('    npx evokit init');
    console.log('');
    console.log('  Or install globally:');
    console.log('    npm install -g @zythegit/evokit');
    console.log('');
  }
}

main();
