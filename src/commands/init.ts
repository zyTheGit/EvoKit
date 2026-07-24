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
import {
  type AdapterInstallConfig,
  type AdapterInstaller,
  type AdapterInstallResult,
  getInstaller,
  listAdapters,
} from '../adapters/index.js';
import { resolveTemplateDir } from '../core/download.js';
import { intro, outro, multiselect, isCancel, cancel, spinner, note } from '@clack/prompts';
import type { AdapterVerifyCheck } from '../adapters/types.js';

/**
 * 所有已知适配器（用于 init 提示）。
 * 使用注册表以与可用适配器保持同步。
 */
function getAdapterChoices(): Array<{
  id: string;
  label: string;
  description: string;
  available: boolean;
}> {
  return listAdapters().map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    available: true,
  }));
}

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
    const homeDir = directory || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('错误：无法确定主目录。'));
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
      adapterIds = await promptAdapterSelection();
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
    let allPass = true;

    for (const id of adapterIds) {
      let installer: AdapterInstaller;
      try {
        installer = getInstaller(id);
      } catch {
        console.error(pc.red(`\n❌ 未知适配器："${id}"`));
        process.exit(1);
        return;
      }

      const config: AdapterInstallConfig = {
        homeDir,
        templateDir,
        projectDir: undefined,
        dryRun: options.dryRun ?? false,
        allowWorkflow: options.allowWorkflow ?? false,
      };

      const installSpin = spinner();
      installSpin.start(`正在安装 ${installer.label}...`);

      try {
        const result = installer.install(config);
        installSpin.stop(`${installer.label} 已安装`);

        printInitSummary(installer, result, options.dryRun);

        if (options.verify && !options.dryRun) {
          const checks = installer.verify(config);
          printInitVerify(checks);
          const checksPass = checks.every((c) => c.pass);
          if (!checksPass) allPass = false;
        }
      } catch (err: any) {
        installSpin.stop(`安装失败：${err.message}`);
        console.error(pc.red(`\n❌ ${installer.label}: ${err.message}`));
        allPass = false;
      }
    }

    if (cleanup) cleanup();

    if (!options.dryRun && allPass) {
      printInitNextSteps(adapterIds);
    }
  });

/**
 * 使用 Clack multiselect 显示交互式适配器选择菜单。
 */
async function promptAdapterSelection(): Promise<string[]> {
  const adapters = getAdapterChoices();

  intro('选择要配置的 AI 助手');

  const result = await multiselect({
    message: 'AI 助手',
    options: adapters.map((a) => ({
      value: a.id,
      label: a.label,
      hint: a.description,
    })),
    required: true,
    initialValues: ['claude'],
  });

  if (isCancel(result)) {
    cancel('安装已取消');
    process.exit(0);
  }

  outro('适配器已选择');
  return result as string[];
}

// ─── 显示辅助函数 ─────────────────────────────────────────

function printInitSummary(
  installer: { label: string },
  summary: AdapterInstallResult,
  dryRun?: boolean,
): void {
  note(
    `目标：${summary.adapterHome}${dryRun ? '（模拟运行）' : ''}\n` +
      `已创建：${summary.filesCreated} 个文件，跳过 ${summary.filesSkipped} 个已存在文件\n` +
      (summary.hooksInstalled > 0 ? `钩子：  ${summary.hooksInstalled} 个已安装\n` : '') +
      (summary.rulesInstalled > 0 ? `规则：  ${summary.rulesInstalled} 个已安装\n` : '') +
      (summary.agentsInstalled > 0 ? `代理：  ${summary.agentsInstalled} 个已安装\n` : '') +
      (summary.commandsInstalled > 0 ? `命令：  ${summary.commandsInstalled} 个已安装\n` : ''),
    `EvoKit — 安装 ${installer.label}`,
  );
}

function printInitVerify(checks: AdapterVerifyCheck[]): void {
  const failures = checks.filter((c) => !c.pass);
  if (failures.length > 0) {
    console.error(pc.yellow(`\n⚠️  ${failures.length} 项验证检查未通过：`));
    for (const f of failures) {
      console.error(`  ${pc.red('✗')} ${f.name}${f.detail ? pc.yellow(` — ${f.detail}`) : ''}`);
    }
  } else {
    console.log(pc.green('\n✅ 验证通过'));
  }
}

function printInitNextSteps(adapterIds: string[]): void {
  for (const id of adapterIds) {
    switch (id) {
      case 'claude':
        console.log(pc.cyan('  后续步骤（Claude Code）：'));
        console.log('  1. 启动 Claude Code');
        console.log('  2. 运行 /boot 验证系统健康状态');
        console.log('');
        break;
      case 'codex':
        console.log(pc.cyan('  后续步骤（Codex CLI）：'));
        console.log('  1. 启动 Codex（钩子自动运行）');
        console.log('  2. 运行：evokit doctor --adapter codex');
        console.log('');
        break;
      case 'opencode':
        console.log(pc.cyan('  后续步骤（OpenCode CLI）：'));
        console.log('  1. 进入项目目录并启动 OpenCode');
        console.log('  2. 调用 evokit-boot 工具验证系统健康状态');
        console.log('');
        break;
    }
  }
}
