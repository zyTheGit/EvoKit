/**
 * EvoKit — Init 命令（install 的别名，向后兼容）
 *
 * 委托适配器注册表执行所有安装逻辑。
 * 交互式提示使用 @clack/prompts 提供现代化终端体验。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { listAdapters } from '../adapters/index.js';
import { resolveTemplateDir } from '../core/download.js';
import { selectAdapters } from '../core/interactive.js';
import {
  resolveHomeDir,
  printNextSteps,
  printSummaryOutro,
  runAdapterInstallLoop,
} from './shared.js';

export const initCommand = new Command('init')
  .description('在主目录中初始化 EvoKit')
  .argument('[directory]', '目标主目录（默认：$HOME）')
  .option('--template <path>', '模板目录路径')
  .option('--branch <name>', '下载模板使用的 GitHub 分支', 'main')
  .option('--dry-run', '预览安装，不修改文件')
  .option('--verify', '安装后运行启动验证')
  .option('--adapter <name>', '目标 AI 助手（claude | codex | opencode | pi）。省略则交互式选择。')
  .option('--allow-workflow', '允许开发工作流命令（npm test/lint 等）免确认')
  .action(async (directory, options) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ directory });
    } catch (err: any) {
      console.error(pc.red(`错误：${err.message}`));
      console.error('  请通过参数指定：evokit init /path/to/home');
      process.exit(1);
    }

    // 解析适配器
    let adapterIds: string[];

    if (options.adapter) {
      adapterIds = options.adapter
        .split(',')
        .map((a: string) => a.trim().toLowerCase())
        .filter(Boolean);
    } else if (process.stdin.isTTY) {
      adapterIds = await selectAdapters(
        listAdapters().map((a) => ({
          key: a.id,
          label: a.label,
          description: a.description,
        })),
      );
    } else {
      adapterIds = ['claude'];
    }

    if (adapterIds.length === 0) adapterIds = ['claude'];

    // 解析模板
    let templateDir: string;
    let cleanup: (() => void) | null = null;
    try {
      const result = await resolveTemplateDir(options.template, options.branch);
      templateDir = result.templateDir;
      cleanup = result.cleanup;
    } catch (err: any) {
      console.error(pc.red(`\n❌ ${err.message}`));
      process.exit(1);
    }

    // 安装每个适配器
    const allPass = runAdapterInstallLoop(adapterIds, {
      verb: '安装',
      config: {
        homeDir,
        templateDir,
        projectDir: undefined,
        dryRun: options.dryRun ?? false,
        allowWorkflow: options.allowWorkflow ?? false,
      },
      verify: options.verify,
      dryRun: options.dryRun ?? false,
    });

    if (cleanup) cleanup();

    printSummaryOutro('安装', options.dryRun ?? false, allPass);

    if (!options.dryRun && allPass) {
      printNextSteps(adapterIds);
    }
  });
