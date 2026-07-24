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
import { getInstaller, listAdapters } from './adapters/index.js';
import { resolveTemplateDir } from './core/download.js';
import { selectAdapters } from './core/interactive.js';
import { spinner, intro, outro, note, log } from '@clack/prompts';
import type { AdapterInstallResult, AdapterVerifyCheck } from './adapters/types.js';

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
    '逗号分隔的适配器名称（claude, codex, opencode）。省略则以交互方式选择。',
  )
  .option('--template <path>', '模板目录路径（用于开发）')
  .option('--branch <name>', '下载模板的 GitHub 分支', 'main')
  .option('--dry-run', '预览安装，不修改文件')
  .option('--verify', '安装后运行启动验证')
  .option('--project-dir <path>', '项目目录（用于 OpenCode 等项目级适配器）')
  .option('--allow-workflow', '允许开发工作流命令（npm test/lint 等）免确认')
  .action(async (options) => {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      log.error('错误：无法确定主目录。');
      log.error('请设置 $HOME 环境变量后重试。');
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
      log.info('使用 --adapter 指定助手：--adapter claude,codex,opencode');
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
    let allPass = true;

    for (const id of adapterIds) {
      let installer;
      try {
        installer = getInstaller(id);
      } catch {
        log.error(`未知适配器："${id}"`);
        log.error(
          `可用适配器：${listAdapters()
            .map((a) => a.id)
            .join(', ')}`,
        );
        allPass = false;
        continue;
      }

      const config = {
        homeDir,
        templateDir,
        projectDir: options.projectDir || process.cwd(),
        dryRun: options.dryRun ?? false,
        allowWorkflow: options.allowWorkflow ?? false,
      };

      const s = spinner();
      s.start(`正在为 ${installer.label} 安装...`);

      try {
        const result = installer.install(config);
        s.stop(`${installer.label} 安装完成`);
        printResult(installer, result);

        if (options.verify && !options.dryRun) {
          const checks = installer.verify(config);
          printVerification(installer, checks);
          const pass = checks.every((c) => c.pass);
          if (!pass) allPass = false;
        }
      } catch (err: any) {
        s.stop(`安装失败`);
        log.error(`${installer.label}: ${err.message}`);
        allPass = false;
      }
    }

    // 清理临时下载
    if (cleanup) cleanup();

    // 摘要
    if (options.dryRun) {
      outro('预演完成——未修改任何文件');
    } else if (allPass) {
      outro('EvoKit 安装成功！');
    } else {
      log.warning('安装完成但有警告——请查看上方输出');
    }

    // 首个适配器安装后的指引
    if (adapterIds.length > 0 && !options.dryRun) {
      printNextSteps(adapterIds);
    }
  });

// ─── 显示辅助函数 ─────────────────────────────────────────

function printResult(installer: { label: string }, result: AdapterInstallResult): void {
  const lines = [
    `目标路径：${result.adapterHome}`,
    `已创建：${result.filesCreated} 个文件，跳过 ${result.filesSkipped} 个`,
  ];
  if (result.hooksInstalled > 0) lines.push(`钩子：已安装 ${result.hooksInstalled} 个`);
  if (result.rulesInstalled > 0) lines.push(`规则：已安装 ${result.rulesInstalled} 个`);
  if (result.agentsInstalled > 0) lines.push(`代理：已安装 ${result.agentsInstalled} 个`);
  if (result.commandsInstalled > 0) lines.push(`命令：已安装 ${result.commandsInstalled} 个`);

  note(lines.join('\n'), `EvoKit — ${installer.label} 安装结果`);
}

function printVerification(installer: { label: string }, checks: AdapterVerifyCheck[]): void {
  log.step(`正在验证 ${installer.label}...`);
  for (const check of checks) {
    if (check.pass) {
      log.success(`${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    } else {
      log.error(`${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    }
  }
}

function printNextSteps(adapterIds: string[]): void {
  const steps: string[] = [];

  for (const id of adapterIds) {
    switch (id) {
      case 'claude':
        steps.push('📖 Claude Code：\n' + '  1. 启动 Claude Code\n' + '  2. 运行 /boot 进行验证');
        break;
      case 'codex':
        steps.push(
          '📖 Codex CLI：\n' +
            '  1. 启动 Codex（钩子自动运行）\n' +
            '  2. 运行：npx evokit doctor --adapter codex',
        );
        break;
      case 'opencode':
        steps.push(
          '📖 OpenCode CLI：\n' +
            '  1. 进入项目目录并启动 OpenCode\n' +
            '  2. 运行 evokit-boot 工具进行验证',
        );
        break;
      default:
        steps.push(`📖 ${id}：已就绪`);
    }
  }

  steps.push('💡 命令行用法：npx evokit doctor');
  steps.push('   或全局安装：npm install -g @zythegit/evokit');
  steps.push('📚 文档：https://github.com/zyTheGit/EvoKit');

  note(steps.join('\n\n'), '后续步骤');
}
