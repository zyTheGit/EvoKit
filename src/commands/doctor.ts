/**
 * EvoKit — Doctor 命令
 *
 * 验证 EvoKit 系统完整性。
 * 通过适配器注册表遍历所有已安装适配器，
 * 调用 adapter.status() 获取检查结果 —— 不再直接导入适配器实现函数。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import fse from 'fs-extra';
import path from 'node:path';
import { listAdapters } from '../adapters/registry.js';
import { getFileLineCount } from '../core/memory.js';

export const doctorCommand = new Command('doctor')
  .description('验证 EvoKit 系统完整性')
  .option('--home <path>', 'EvoKit 主目录（默认: $HOME）')
  .option('--fix', '尝试修复常见问题')
  .option('--adapter <name>', '检查指定适配器（claude | codex | opencode | pi | all）', 'all')
  .action(async (options) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('错误：无法确定主目录。'));
      process.exit(1);
    }

    const adapter = options.adapter || 'all';

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — 系统健康检查                  ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  主目录: ${homeDir}`);
    console.log('');

    let allPass = true;
    const adapters = listAdapters();

    for (const installer of adapters) {
      if (adapter !== 'all' && adapter !== installer.id) continue;

      const config = { homeDir, templateDir: '' };
      const status = installer.status(config);

      console.log(pc.cyan(`\n📁 ${installer.label} — ${status.adapterHome}`));

      if (!status.installed) {
        console.log(pc.yellow(`  ⚠ ${installer.label} 适配器：未安装`));
        console.log(`    运行：evokit init --adapter ${installer.id}`);
        allPass = false;
        continue;
      }

      let pass = true;
      for (const check of status.checks) {
        const icon = check.pass ? pc.green('✓') : pc.red('✗');
        console.log(
          `  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`,
        );
        if (!check.pass) pass = false;
      }

      if (!pass) allPass = false;

      // Claude 特有：文件大小限制检查
      if (installer.id === 'claude') {
        console.log(pc.cyan('\n📏 Claude Code — 文件大小限制...'));
        const rootClaudeMd = path.join(homeDir, 'CLAUDE.md');
        if (fse.existsSync(rootClaudeMd)) {
          const lines = getFileLineCount(rootClaudeMd);
          if (lines > 150) {
            console.log(`  ${pc.yellow('⚠️')} CLAUDE.md：${lines} 行（限制：150）`);
            allPass = false;
          } else {
            console.log(`  ${pc.green('✓')} CLAUDE.md：${lines}/150 行`);
          }
        }

        // 记忆文件检查
        allPass = !checkMemory(homeDir, '.claude') && allPass;
      }
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
