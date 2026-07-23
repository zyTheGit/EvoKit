import { Command } from 'commander';
import pc from 'picocolors';
import fse from 'fs-extra';
import path from 'node:path';
import { verifyClaudeInstallation } from '../adapters/claude/adapter.js';
import { getFileLineCount } from '../core/memory.js';
import { getCodexStatus, verifyCodexSetup } from '../adapters/codex/adapter.js';
import { getOpenCodeStatus } from '../adapters/opencode/adapter.js';

export const doctorCommand = new Command('doctor')
  .description('验证 EvoKit 系统完整性')
  .option('--home <path>', 'EvoKit 主目录（默认: $HOME）')
  .option('--fix', '尝试修复常见问题')
  .option('--adapter <name>', '检查指定适配器（claude | codex | opencode | all）', 'all')
  .action(async (options) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('错误：无法确定主目录。'));
      process.exit(1);
    }

    const claudeDir = path.join(homeDir, '.claude');
    const adapter = options.adapter || 'all';

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — 系统健康检查                  ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  主目录: ${claudeDir}`);
    console.log('');

    let allPass = true;

    // 检查 Claude Code 适配器
    if (adapter === 'all' || adapter === 'claude') {
      allPass = !(await checkClaude(claudeDir, homeDir, options)) && allPass;
    }

    // 检查 Codex CLI 适配器
    if (adapter === 'all' || adapter === 'codex') {
      allPass = !(await checkCodex(homeDir, options)) && allPass;
    }

    // 检查 OpenCode CLI 适配器
    if (adapter === 'all' || adapter === 'opencode') {
      allPass = !(await checkOpenCode()) && allPass;
    }

    // 记忆文件检查
    if (adapter === 'all' || adapter === 'claude') {
      allPass = !checkMemory(homeDir, '.claude') && allPass;
    }

    // 汇总
    console.log('');
    if (allPass) {
      console.log(pc.green('✅ 所有检查通过！系统健康。'));
    } else {
      console.log(pc.yellow('⚠️  部分检查未通过。使用 --fix 尝试修复。'));
    }
    console.log('');
  });

async function checkClaude(claudeDir: string, homeDir: string, options: any): Promise<boolean> {
  if (!fse.existsSync(claudeDir)) {
    console.log(pc.yellow(`  ⚠ Claude Code 适配器：未安装在 ${claudeDir}`));
    return false;
  }

  console.log(pc.cyan('📁 Claude Code — 目录结构...'));
  let pass = true;
  const checks = verifyClaudeInstallation(homeDir, process.cwd());
  for (const check of checks) {
    const icon = check.pass ? pc.green('✓') : pc.red('✗');
    console.log(`  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`);
    if (!check.pass) pass = false;
  }

  // 文件大小限制
  console.log(pc.cyan('\n📏 Claude Code — 文件大小限制...'));
  const rootClaudeMd = path.join(homeDir, 'CLAUDE.md');
  if (fse.existsSync(rootClaudeMd)) {
    const lines = getFileLineCount(rootClaudeMd);
    if (lines > 150) {
      console.log(`  ${pc.yellow('⚠️')} CLAUDE.md：${lines} 行（限制：150）`);
      pass = false;
    } else {
      console.log(`  ${pc.green('✓')} CLAUDE.md：${lines}/150 行`);
    }
  }

  return pass;
}

async function checkCodex(homeDir: string, options: any): Promise<boolean> {
  const status = getCodexStatus(homeDir);

  if (!status.installed) {
    console.log(pc.yellow(`  ⚠ Codex CLI 适配器：未安装在 ${status.codexHome}`));
    console.log(`    运行：evokit init --adapter codex`);
    return false;
  }

  console.log(pc.cyan(`\n📁 Codex CLI — ${status.codexHome}...`));
  let pass = true;

  const checks = verifyCodexSetup(homeDir);
  for (const check of checks) {
    const icon =
      check.status === 'pass'
        ? pc.green('✓')
        : check.status === 'warn'
          ? pc.yellow('⚠')
          : pc.red('✗');
    console.log(`  ${icon} ${check.check}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`);
    if (check.status !== 'pass') pass = false;
  }

  console.log(`  ${pc.green('✓')} 已安装规则：${status.ruleCount}`);

  return pass;
}

async function checkOpenCode(): Promise<boolean> {
  const projectDir = process.cwd();
  const status = getOpenCodeStatus(projectDir);

  if (!status.installed) {
    console.log(pc.yellow(`  ⚠ OpenCode CLI 适配器：未安装`));
    console.log(`    运行：evokit init --adapter opencode`);
    return false;
  }

  console.log(pc.cyan('\n📁 OpenCode CLI...'));
  let pass = true;

  const checks = [
    { name: '~/.config/opencode/AGENTS.md', pass: status.agentsPresent },
    { name: '~/.config/opencode/opencode.json', pass: status.configPresent },
    { name: '.opencode/tools/', pass: status.toolsPresent },
    { name: '~/.config/opencode/memory/', pass: status.memoryPresent },
  ];

  for (const check of checks) {
    const icon = check.pass ? pc.green('✓') : pc.red('✗');
    console.log(`  ${icon} ${check.name}`);
    if (!check.pass) pass = false;
  }

  if (status.agentCount > 0) {
    console.log(`  ${pc.green('✓')} 子代理：已定义 ${status.agentCount} 个`);
  }

  return pass;
}

function checkMemory(homeDir: string, subDir: string): boolean {
  const memoryDir = path.join(homeDir, subDir, 'memory');
  console.log(pc.cyan(`\n💾 记忆文件 (${subDir}/memory/)...`));

  if (!fse.existsSync(memoryDir)) {
    console.log(`  ${pc.yellow('⚠')} 记忆目录未找到`);
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
    console.log(`  ${exists ? pc.green('✓') : pc.yellow('⚠')} ${file}${!exists ? '（可选）' : ''}`);
    if (!exists && file !== 'README.md') allExist = false;
  }

  return allExist;
}
