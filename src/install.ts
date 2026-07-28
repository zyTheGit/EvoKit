/**
 * EvoKit — 安装命令
 *
 * `evokit install` 命令执行以下步骤：
 * 1. 解析要安装的适配器（通过 --adapter 标志或 Clack 交互菜单）
 * 2. 解析模板目录（内置、本地路径或 GitHub）
 * 3. 调用每个适配器的 install() 方法并显示进度
 * 4. 可选地运行验证
 *
 * 使用 @clack/prompts 处理所有用户交互。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import fs from 'node:fs';
import { ReadStream } from 'node:tty';
import { listAdapters } from './adapters/index.js';
import { resolveTemplateDir } from './core/download.js';
import { selectAdapters } from './core/interactive.js';
import { log } from '@clack/prompts';
import {
  resolveHomeDir,
  printNextSteps,
  printSummaryOutro,
  runAdapterInstallLoop,
} from './commands/shared.js';

/**
 * 在管道上下文（如 curl | bash）中尝试让 stdin 变为交互模式。
 *
 * 在 Unix 上，/dev/tty 是控制终端——如果存在，无论各个文件描述符
 * 如何被重定向，我们都可以从中重新打开 stdin。
 * 当没有可用的 TTY 时（CI、Docker 等）静默回退。
 *
 * @returns stdin 已变为交互模式则返回 true，否则返回 false。
 */
function ensureInteractive(): boolean {
  if (process.stdin.isTTY) return true;

  // stdin 被管道重定向（如 curl | bash）——尝试直接使用 /dev/tty。
  // 即使 npx/npm 重定向了 stdout/stderr 也能正常工作。
  try {
    const fd = fs.openSync('/dev/tty', 'r');
    process.stdin = new ReadStream(fd) as typeof process.stdin;
    return true;
  } catch {
    // 没有 TTY 可用（CI、Docker 等）
  }

  return false;
}

export const installCommand = new Command('install')
  .description('为一个或多个 AI 编程助手安装 EvoKit')
  .option(
    '--adapter <names>',
    '逗号分隔的适配器名称（claude, codex, opencode, pi）。省略则以交互方式选择。',
  )
  .option('--template <path>', '模板目录路径（用于开发）')
  .option('--branch <name>', '下载模板的 GitHub 分支', 'main')
  .option('--dry-run', '预览安装，不修改文件')
  .option('--verify', '安装后运行启动验证')
  .option('--project-dir <path>', '项目目录（用于 OpenCode 等项目级适配器）')
  .option('--allow-workflow', '允许开发工作流命令（npm test/lint 等）免确认')
  .action(async (options) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir();
    } catch (err: any) {
      log.error(`错误：${err.message}`);
      process.exit(1);
    }

    // ── 解析适配器 ───────────────────────────────────
    let adapterIds: string[];

    if (options.adapter) {
      adapterIds = options.adapter
        .split(',')
        .map((a: string) => a.trim().toLowerCase())
        .filter(Boolean);
    } else if (ensureInteractive()) {
      adapterIds = await selectAdapters(
        listAdapters().map((a) => ({
          key: a.id,
          label: a.label,
          description: a.description,
        })),
      );
    } else {
      log.info('检测到非交互终端——默认使用 Claude Code。');
      log.info('使用 --adapter 指定助手：--adapter claude,codex,opencode,pi');
      adapterIds = ['claude'];
    }

    if (adapterIds.length === 0) adapterIds = ['claude'];

    // ── 解析模板 ──────────────────────────────────
    let templateDir: string;
    let cleanup: (() => void) | null = null;
    try {
      const result = await resolveTemplateDir(options.template, options.branch);
      templateDir = result.templateDir;
      cleanup = result.cleanup;
    } catch (err: any) {
      log.error(err.message);
      process.exit(1);
    }

    // ── 安装各适配器 ──────────────────────────────
    const allPass = runAdapterInstallLoop(adapterIds, {
      verb: '安装',
      config: {
        homeDir,
        templateDir,
        projectDir: options.projectDir || undefined,
        dryRun: options.dryRun ?? false,
        allowWorkflow: options.allowWorkflow ?? false,
      },
      verify: options.verify,
      dryRun: options.dryRun ?? false,
    });

    // 清理临时下载
    if (cleanup) cleanup();

    // 摘要
    printSummaryOutro('安装', options.dryRun ?? false, allPass);

    // 首个适配器安装后的指引
    if (adapterIds.length > 0 && !options.dryRun) {
      printNextSteps(adapterIds);
    }
  });
