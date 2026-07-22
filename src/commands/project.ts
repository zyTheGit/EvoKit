/**
 * EvoKit — Project 命令
 *
 * 在目标项目目录中生成项目级 .claude/ 结构（rules + CLAUDE.md + agents + commands），
 * 使 AI 助手能理解项目上下文并遵循项目规范。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { intro, outro, text, confirm, isCancel, cancel, spinner, note } from '@clack/prompts';
import {
  generateProjectStructure,
  type ProjectInfo,
  type RuleToggles,
  type ProjectGenerateResult,
} from '../core/project-generator.js';

export const projectCommand = new Command('project')
  .description('在项目目录中生成 AI 助手规范文件')
  .argument('[directory]', '目标项目目录（默认：当前目录）')
  .option('--dry-run', '预览生成，不写入文件')
  .option('--name <name>', '项目名称（跳过交互式提问）')
  .option('--desc <description>', '项目描述（跳过交互式提问）')
  .option('--lang <language>', '主要语言/框架（跳过交互式提问）')
  .option('--no-commit-rule', '不生成 commit 规范规则')
  .option('--no-test-rule', '不生成测试门禁规则')
  .option('--no-docs-rule', '不生成文档同步规则')
  .action(async (directory, options) => {
    const targetDir = directory || process.cwd();

    intro('EvoKit — 项目级规范生成');

    // ── 1. 收集项目信息 ──────────────────────────────────
    let projectInfo: ProjectInfo;

    if (options.name && options.desc && options.lang) {
      // 非交互模式：全部通过选项提供
      projectInfo = {
        name: options.name,
        description: options.desc,
        language: options.lang,
      };
    } else if (process.stdin.isTTY) {
      // 交互模式
      const nameResult = await text({
        message: '项目名称',
        placeholder: 'my-project',
        defaultValue: options.name,
      });
      if (isCancel(nameResult)) {
        cancel('已取消');
        process.exit(0);
      }

      const descResult = await text({
        message: '项目描述（一句话）',
        placeholder: '一个示例项目',
        defaultValue: options.desc,
      });
      if (isCancel(descResult)) {
        cancel('已取消');
        process.exit(0);
      }

      const langResult = await text({
        message: '主要语言/框架',
        placeholder: 'TypeScript / Python / Go / ...',
        defaultValue: options.lang,
      });
      if (isCancel(langResult)) {
        cancel('已取消');
        process.exit(0);
      }

      projectInfo = {
        name: String(nameResult) || 'my-project',
        description: String(descResult) || '',
        language: String(langResult) || '通用',
      };
    } else {
      // 非交互终端 + 未提供完整选项 → 使用默认值
      projectInfo = {
        name: options.name || 'my-project',
        description: options.desc || '',
        language: options.lang || '通用',
      };
      console.log(pc.dim('  检测到非交互终端——使用默认项目信息'));
    }

    // ── 2. 收集规则开关 ──────────────────────────────────
    const ruleToggles: RuleToggles = {
      commitConvention: options.commitRule !== false,
      testGate: options.testRule !== false,
      docsSync: options.docsRule !== false,
    };

    // 交互模式下确认规则选择
    if (process.stdin.isTTY && !options.name) {
      const rulesConfirmed = await confirm({
        message: `生成规则：${[
          ruleToggles.commitConvention && 'commit 规范',
          ruleToggles.testGate && '测试门禁',
          ruleToggles.docsSync && '文档同步',
        ]
          .filter(Boolean)
          .join('、')}`,
        initialValue: true,
      });
      if (isCancel(rulesConfirmed)) {
        cancel('已取消');
        process.exit(0);
      }
    }

    // ── 3. 执行生成 ──────────────────────────────────────
    const s = spinner();
    s.start('正在生成项目规范...');

    try {
      const result = await generateProjectStructure({
        targetDir,
        projectInfo,
        ruleToggles,
        dryRun: options.dryRun ?? false,
      });

      s.stop(options.dryRun ? '预演完成' : '生成完成');
      printProjectSummary(targetDir, result, options.dryRun);
    } catch (err: unknown) {
      s.stop('生成失败');
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`\n❌ ${message}`));
      process.exit(1);
    }

    outro(options.dryRun ? '预演完成——未写入任何文件' : '项目规范已生成！');
  });

// ─── 显示辅助函数 ──────────────────────────────────────────

function printProjectSummary(
  targetDir: string,
  result: ProjectGenerateResult,
  dryRun?: boolean,
): void {
  const lines: string[] = [];
  lines.push(`目标：${targetDir}${dryRun ? '（模拟运行）' : ''}`);
  lines.push(`已创建：${result.filesCreated} 个文件，跳过 ${result.filesSkipped} 个已存在文件`);

  if (result.claudeMdCreated) {
    lines.push('CLAUDE.md：✓ 已创建');
  } else {
    lines.push('CLAUDE.md：⏭ 已存在，跳过');
  }

  if (result.rulesCreated.length > 0) {
    lines.push(`规则：${result.rulesCreated.map((r) => `rules/${r}`).join('、')}`);
  }

  if (result.agentsCreated.length > 0) {
    lines.push(`代理：${result.agentsCreated.map((a) => `agents/${a}`).join('、')}`);
  }

  if (result.commandsCreated.length > 0) {
    lines.push(`命令：${result.commandsCreated.map((c) => `commands/${c}`).join('、')}`);
  }

  note(lines.join('\n'), 'EvoKit — 项目规范生成');

  if (!dryRun && result.filesCreated > 0) {
    console.log(pc.cyan('\n  后续步骤：'));
    console.log('  1. 编辑 CLAUDE.md 补充项目关键目录和开发命令');
    console.log('  2. 根据需要调整 .claude/rules/ 中的规则');
    console.log('  3. 启动 AI 助手，运行 /boot 验证');
    console.log('');
  }
}
