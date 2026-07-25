/**
 * EvoKit — Doctor 命令
 *
 * 验证 EvoKit 系统完整性。
 * 通过适配器注册表遍历所有已安装适配器，
 * 调用 adapter.status() 获取检查结果 —— 不再直接导入适配器实现函数。
 * 适配器特有检查（如 Claude 的 CLAUDE.md 行数限制、记忆文件检查）
 * 通过 status().extraChecks 暴露，doctor 不硬编码任何适配器特有逻辑。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { listAdapters } from '../adapters/registry.js';
import { resolveHomeDir } from './shared.js';

export const doctorCommand = new Command('doctor')
  .description('验证 EvoKit 系统完整性')
  .option('--home <path>', 'EvoKit 主目录（默认: $HOME）')
  .option('--fix', '尝试修复常见问题')
  .option('--adapter <name>', '检查指定适配器（claude | codex | opencode | pi | all）', 'all')
  .option('--project-dir <path>', '项目目录（用于 OpenCode 等项目级适配器）')
  .action(async (options) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home });
    } catch (err: any) {
      console.error(pc.red(`错误：${err.message}`));
      process.exit(1);
    }

    const adapter = options.adapter || 'all';
    const projectDir = options.projectDir || undefined;

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — 系统健康检查                  ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  主目录: ${homeDir}`);
    if (projectDir) {
      console.log(`  项目目录: ${projectDir}`);
    }
    console.log('');

    let allPass = true;
    const adapters = listAdapters();

    for (const installer of adapters) {
      if (adapter !== 'all' && adapter !== installer.id) continue;

      const config = { homeDir, templateDir: '', projectDir };
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

      // 遍历适配器特有的额外检查项（如 Claude 的 CLAUDE.md 行数限制、记忆文件检查）
      // 不硬编码任何适配器特有逻辑 —— 全部通过 status().extraChecks 暴露
      if (status.extraChecks && status.extraChecks.length > 0) {
        for (const check of status.extraChecks) {
          const icon = check.pass ? pc.green('✓') : pc.red('✗');
          console.log(
            `  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`,
          );
          if (!check.pass) pass = false;
        }
      }

      if (!pass) allPass = false;
    }

    // 汇总 — allPass 仅基于实际检查的适配器结果
    console.log('');
    if (allPass) {
      console.log(pc.green('✅ 所有检查通过！系统健康。'));
    } else {
      console.log(pc.yellow('⚠️  部分检查未通过。使用 --fix 尝试修复。'));
    }
    console.log('');
  });
