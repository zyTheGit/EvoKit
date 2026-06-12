import { Command } from 'commander';
import pc from 'picocolors';
import fse from 'fs-extra';
import path from 'node:path';
import { verifyInstallation } from '../core/template.js';
import { getFileLineCount, getMemoryDir } from '../core/memory.js';

export const doctorCommand = new Command('doctor')
  .description('Verify EvoKit system integrity')
  .option('--home <path>', 'EvoKit home directory (default: $HOME)')
  .option('--fix', 'Attempt to fix common issues')
  .action(async (options) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('Error: Could not determine home directory.'));
      process.exit(1);
    }

    const claudeDir = path.join(homeDir, '.claude');
    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — System Health Check            ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  Home: ${claudeDir}`);
    console.log('');

    // Check if EvoKit is installed
    if (!fse.existsSync(claudeDir)) {
      console.error(pc.red(`✗ EvoKit is not installed at ${claudeDir}`));
      console.error(pc.yellow('  Run "evokit init" to install.'));
      process.exit(1);
    }

    // 1. Directory structure + key files
    console.log(pc.cyan('📁 Directory structure...'));
    let allPass = true;
    const checks = verifyInstallation(homeDir);
    for (const check of checks) {
      const icon = check.pass ? pc.green('✓') : pc.red('✗');
      console.log(`  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`);
      if (!check.pass) allPass = false;
    }

    // 2. File size limits
    console.log(pc.cyan('\n📏 File size limits...'));

    const rootClaudeMd = path.join(homeDir, 'CLAUDE.md');
    if (fse.existsSync(rootClaudeMd)) {
      const lines = getFileLineCount(rootClaudeMd);
      const limit = 150;
      if (lines > limit) {
        console.log(`  ${pc.yellow('⚠️')} CLAUDE.md: ${lines} lines (limit: ${limit})`);
        allPass = false;
      } else {
        console.log(`  ${pc.green('✓')} CLAUDE.md: ${lines}/${limit} lines`);
      }
    }

    const memoryDir = getMemoryDir(homeDir);
    const rulesPath = path.join(memoryDir, 'learned-rules.md');
    if (fse.existsSync(rulesPath)) {
      const lines = getFileLineCount(rulesPath);
      const limit = 50;
      if (lines > limit) {
        console.log(`  ${pc.yellow('⚠️')} learned-rules.md: ${lines} lines (limit: ${limit})`);
        allPass = false;
      } else {
        console.log(`  ${pc.green('✓')} learned-rules.md: ${lines}/${limit} lines`);
      }
    }

    // 3. Memory file consistency
    console.log(pc.cyan('\n💾 Memory files...'));
    const memoryFiles = [
      'corrections.jsonl',
      'observations.jsonl',
      'sessions.jsonl',
      'violations.jsonl',
      'learned-rules.md',
      'evolution-log.md',
      'README.md',
    ];
    for (const file of memoryFiles) {
      const fp = path.join(memoryDir, file);
      const exists = fse.existsSync(fp);
      console.log(`  ${exists ? pc.green('✓') : pc.red('✗')} ${file}${!exists ? pc.yellow(' — missing') : ''}`);
      if (!exists) allPass = false;
    }

    // Summary
    console.log('');
    if (allPass) {
      console.log(pc.green('✅ All checks passed! System is healthy.'));
    } else {
      console.log(pc.yellow('⚠️  Some checks failed. Run with --fix to attempt repairs.'));
    }
    console.log('');
  });
