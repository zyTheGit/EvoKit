import { Command } from 'commander';
import pc from 'picocolors';
import fse from 'fs-extra';
import path from 'node:path';
import { verifyInstallation } from '../core/template.js';
import { getFileLineCount } from '../core/memory.js';
import { getCodexStatus, verifyCodexSetup } from '../adapters/codex/adapter.js';
import { getOpenCodeStatus } from '../adapters/opencode/adapter.js';

export const doctorCommand = new Command('doctor')
  .description('Verify EvoKit system integrity')
  .option('--home <path>', 'EvoKit home directory (default: $HOME)')
  .option('--fix', 'Attempt to fix common issues')
  .option('--adapter <name>', 'Check specific adapter (claude | codex | opencode | all)', 'all')
  .action(async (options) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('Error: Could not determine home directory.'));
      process.exit(1);
    }

    const claudeDir = path.join(homeDir, '.claude');
    const adapter = options.adapter || 'all';

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — System Health Check            ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  Home: ${claudeDir}`);
    console.log('');

    let allPass = true;

    // Check Claude Code adapter
    if (adapter === 'all' || adapter === 'claude') {
      allPass = !(await checkClaude(claudeDir, homeDir, options)) && allPass;
    }

    // Check Codex CLI adapter
    if (adapter === 'all' || adapter === 'codex') {
      allPass = !(await checkCodex(homeDir, options)) && allPass;
    }

    // Check OpenCode CLI adapter
    if (adapter === 'all' || adapter === 'opencode') {
      allPass = !(await checkOpenCode()) && allPass;
    }

    // Memory check
    if (adapter === 'all' || adapter === 'claude') {
      allPass = !checkMemory(homeDir, '.claude') && allPass;
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

async function checkClaude(claudeDir: string, homeDir: string, options: any): Promise<boolean> {
  if (!fse.existsSync(claudeDir)) {
    console.log(pc.yellow(`  ⚠ Claude Code adapter: not installed at ${claudeDir}`));
    return false;
  }

  console.log(pc.cyan('📁 Claude Code — Directory structure...'));
  let pass = true;
  const checks = verifyInstallation(homeDir);
  for (const check of checks) {
    const icon = check.pass ? pc.green('✓') : pc.red('✗');
    console.log(`  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`);
    if (!check.pass) pass = false;
  }

  // File size limits
  console.log(pc.cyan('\n📏 Claude Code — File size limits...'));
  const rootClaudeMd = path.join(homeDir, 'CLAUDE.md');
  if (fse.existsSync(rootClaudeMd)) {
    const lines = getFileLineCount(rootClaudeMd);
    if (lines > 150) {
      console.log(`  ${pc.yellow('⚠️')} CLAUDE.md: ${lines} lines (limit: 150)`);
      pass = false;
    } else {
      console.log(`  ${pc.green('✓')} CLAUDE.md: ${lines}/150 lines`);
    }
  }

  return pass;
}

async function checkCodex(homeDir: string, options: any): Promise<boolean> {
  const status = getCodexStatus(homeDir);

  if (!status.installed) {
    console.log(pc.yellow(`  ⚠ Codex CLI adapter: not installed at ${status.codexHome}`));
    console.log(`    Run: evokit init --adapter codex`);
    return false;
  }

  console.log(pc.cyan(`\n📁 Codex CLI — ${status.codexHome}...`));
  let pass = true;

  const checks = verifyCodexSetup(homeDir);
  for (const check of checks) {
    const icon = check.status === 'pass' ? pc.green('✓') : check.status === 'warn' ? pc.yellow('⚠') : pc.red('✗');
    console.log(`  ${icon} ${check.check}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`);
    if (check.status !== 'pass') pass = false;
  }

  console.log(`  ${pc.green('✓')} Rules installed: ${status.ruleCount}`);

  return pass;
}

async function checkOpenCode(): Promise<boolean> {
  const projectDir = process.cwd();
  const status = getOpenCodeStatus(projectDir);

  if (!status.installed) {
    console.log(pc.yellow(`  ⚠ OpenCode CLI adapter: not installed`));
    console.log(`    Run: evokit init --adapter opencode`);
    return false;
  }

  console.log(pc.cyan('\n📁 OpenCode CLI...'));
  let pass = true;

  const checks = [
    { name: '~/.config/opencode/AGENTS.md',   pass: status.agentsPresent },
    { name: '~/.config/opencode/opencode.json', pass: status.configPresent },
    { name: '.opencode/tools/',                 pass: status.toolsPresent },
    { name: '~/.config/opencode/memory/',       pass: status.memoryPresent },
  ];

  for (const check of checks) {
    const icon = check.pass ? pc.green('✓') : pc.red('✗');
    console.log(`  ${icon} ${check.name}`);
    if (!check.pass) pass = false;
  }

  if (status.agentCount > 0) {
    console.log(`  ${pc.green('✓')} Sub-agents: ${status.agentCount} defined`);
  }

  return pass;
}

function checkMemory(homeDir: string, subDir: string): boolean {
  const memoryDir = path.join(homeDir, subDir, 'memory');
  console.log(pc.cyan(`\n💾 Memory (${subDir}/memory/)...`));

  if (!fse.existsSync(memoryDir)) {
    console.log(`  ${pc.yellow('⚠')} Memory directory not found`);
    return false;
  }

  const memoryFiles = [
    'corrections.jsonl',
    'observations.jsonl',
    'sessions.jsonl',
    'violations.jsonl',
    'learned-rules.md',
    'evolution-log.md',
    'README.md',
  ];

  let allExist = true;
  for (const file of memoryFiles) {
    const fp = path.join(memoryDir, file);
    const exists = fse.existsSync(fp);
    console.log(`  ${exists ? pc.green('✓') : pc.yellow('⚠')} ${file}${!exists ? ' (optional)' : ''}`);
    if (!exists && file !== 'README.md') allExist = false;
  }

  return allExist;
}
