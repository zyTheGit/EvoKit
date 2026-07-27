/**
 * EvoKit — Update 命令
 *
 * `evokit update` 命令：
 * 1. 读取清单，确定已安装适配器（默认自动检测，--adapter 可覆盖）
 * 2. 版本对比：manifest.evokitVersion vs 当前版本，相同则提示退出
 * 3. 确认后对每个适配器执行 upgrade profile 安装
 * 4. 覆盖框架管理文件（hooks、rules、commands、agents、skills、settings）
 * 5. 保留用户数据（CLAUDE.md、MEMORY.md、memory/种子文件）
 * 6. 可选验证（--verify）
 *
 * 使用 @clack/prompts 进行交互式确认。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { spinner, intro, outro, note, log, confirm, isCancel, cancel } from '@clack/prompts';
import { readManifest } from '../core/manifest.js';
import { getEvokitVersion } from '../core/version.js';
import { getInstaller } from '../adapters/index.js';
import type { AdapterVerifyCheck } from '../adapters/types.js';
import { resolveHomeDir, resolveAdapter } from './shared.js';
import { resolveTemplateDir } from '../core/download.js';

export const updateCommand = new Command('update')
  .description('更新已安装适配器的 EvoKit 模板文件')
  .argument(
    '[adapter]',
    '适配器名称（claude、codex、opencode、pi）。省略则从清单自动选择所有已安装适配器。',
  )
  .option('--adapter <names>', '逗号分隔的适配器名称，覆盖自动检测')
  .option('--dry-run', '预览更新，不修改文件')
  .option('--force', '跳过确认提示和版本检查')
  .option('--verify', '更新后运行验证')
  .option('--template <path>', '模板目录路径（用于开发）')
  .option('--branch <name>', '下载模板的 GitHub 分支', 'main')
  .option('--home <path>', '目标主目录（默认：$HOME）')
  .option('--project-dir <path>', '项目目录（更新项目级文件）')
  .addHelpText(
    'after',
    `
更新策略：
  清单驱动    — 读取 ~/.evokit/manifest.json 确定已安装适配器
  版本对比    — 显示当前版本 → 目标版本
  文件策略    — 覆盖框架文件（hooks、rules、commands、agents、skills、settings）
                 保留用户数据（CLAUDE.md、MEMORY.md、memory/ 内容）

选项说明：
  --adapter    指定更新的适配器，默认自动检测清单中所有已安装适配器
  --dry-run    仅预览将更新的内容，不实际修改
  --force      跳过确认提示和版本相同检查
  --verify     更新后运行验证

示例：
  evokit update                 交互式更新所有已安装适配器
  evokit update claude          仅更新 Claude Code
  evokit update --dry-run       预览所有适配器的更新内容
  evokit update --force         跳过确认，直接更新

更新后：
  运行 evokit doctor 验证系统健康状态`,
  )
  .action(async (adapterArg: string | undefined, options: any) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home });
    } catch (err: any) {
      log.error(`错误：${err.message}`);
      process.exit(1);
    }

    // ── 读取清单 ──────────────────────────────────
    const manifest = readManifest(homeDir);
    if (!manifest || Object.keys(manifest.adapters).length === 0) {
      log.error('未检测到已安装的适配器。');
      log.info('请先运行 evokit install 安装适配器。');
      process.exit(1);
    }

    // ── 版本对比 ──────────────────────────────────
    const currentVersion = getEvokitVersion();
    const manifestVersion = manifest.evokitVersion;

    if (currentVersion !== manifestVersion && !options.force) {
      // 模板版本不同，显示对比
      log.info(`模板版本：${pc.cyan(manifestVersion)} → ${pc.green(currentVersion)}`);
    } else if (!options.force) {
      log.info(`当前已是最新版本 ${pc.green(currentVersion)}，无需更新。`);
      log.info('如需强制重新部署，请使用 --force 选项。');
      process.exit(0);
    }

    // ── 解析适配器 ──────────────────────────────────
    let adapterIds: string[];

    if (options.adapter) {
      // --adapter 显式指定
      adapterIds = options.adapter
        .split(',')
        .map((a: string) => a.trim().toLowerCase())
        .filter(Boolean);
    } else if (adapterArg) {
      // 位置参数指定
      adapterIds = [adapterArg.trim().toLowerCase()];
    } else {
      // 从清单自动选择所有已安装适配器
      adapterIds = Object.keys(manifest.adapters);
    }

    // 验证所有适配器 ID 有效
    for (const id of adapterIds) {
      const resolved = resolveAdapter(id);
      if (!resolved.ok) {
        log.error(resolved.error.message);
        log.error(resolved.error.availableAdapters);
        process.exit(1);
      }
    }

    // ── 显示预览 ──────────────────────────────────
    intro(pc.bgCyan(pc.black(' EvoKit 更新 ')));

    const previewLines: string[] = [];
    for (const id of adapterIds) {
      const installer = getInstaller(id);
      const record = manifest.adapters[id];
      if (record) {
        previewLines.push(`  ${pc.cyan(installer.label)} — 路径 ${record.adapterHome}`);
      } else {
        previewLines.push(`  ${pc.cyan(installer.label)} — 新安装，路径 ${installer.id}`);
      }
    }
    note(previewLines.join('\n'), '将更新的适配器');

    // ── 确认 ──────────────────────────────────────
    if (!options.force && !options.dryRun) {
      const shouldContinue = await confirm({
        message:
          '确认更新？将覆盖框架管理文件（hooks、rules、commands、agents、skills），保留用户数据。',
      });
      if (isCancel(shouldContinue) || !shouldContinue) {
        cancel('更新已取消');
        process.exit(0);
      }
    }

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

    // ── 执行更新 ──────────────────────────────────
    let allPass = true;

    for (const id of adapterIds) {
      const installer = getInstaller(id);

      const config = {
        homeDir,
        templateDir,
        projectDir: options.projectDir || undefined,
        dryRun: options.dryRun ?? false,
        allowWorkflow: false,
        profile: 'upgrade' as const,
      };

      const s = spinner();
      s.start(`正在更新 ${installer.label}...`);

      try {
        const result = installer.install(config);
        s.stop(`${installer.label} 更新完成`);

        const resultLines: string[] = [`目标路径：${result.adapterHome}`];

        const updates: string[] = [];
        if (result.hooksInstalled > 0) updates.push(`钩子 ${result.hooksInstalled} 个`);
        if (result.rulesInstalled > 0) updates.push(`规则 ${result.rulesInstalled} 个`);
        if (result.commandsInstalled > 0) updates.push(`命令 ${result.commandsInstalled} 个`);
        if (result.agentsInstalled > 0) updates.push(`代理 ${result.agentsInstalled} 个`);
        if (result.skillsInstalled > 0) updates.push(`技能 ${result.skillsInstalled} 个`);
        if (result.filesCreated > 0) updates.push(`文件 ${result.filesCreated} 个`);

        if (updates.length > 0) {
          resultLines.push(`已更新：${updates.join('，')}`);
        }
        if (result.filesSkipped > 0) {
          resultLines.push(`已跳过：${result.filesSkipped} 个文件（用户数据保留）`);
        }

        note(resultLines.join('\n'), `EvoKit — ${installer.label} 更新结果`);

        if (options.verify && !options.dryRun) {
          const checks = installer.verify(config);
          printVerification(installer, checks);
          const pass = checks.every((c) => c.pass);
          if (!pass) allPass = false;
        }
      } catch (err: any) {
        s.stop(`更新失败`);
        log.error(`${installer.label}：${err.message}`);
        allPass = false;
      }
    }

    // 清理临时下载
    if (cleanup) cleanup();

    // ── 摘要 ──────────────────────────────────────
    if (options.dryRun) {
      outro('模拟运行完成 — 未修改任何文件');
    } else if (allPass) {
      outro('EvoKit 更新成功！');
    } else {
      log.warning('更新完成但有警告——请查看上方输出');
    }

    if (!options.dryRun) {
      log.info(`运行 ${pc.cyan('evokit doctor')} 验证系统健康状态。`);
    }
  });

// ─── 显示辅助函数 ─────────────────────────────────────────

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
