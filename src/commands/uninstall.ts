/**
 * EvoKit — Uninstall 命令
 *
 * `evokit uninstall` 命令：
 * 1. 解析要卸载的适配器（从参数或清单获取）
 * 2. 读取清单进行精确卸载，或回退到启发式模式
 * 3. 对将被修改/删除的文件创建备份
 * 4. 反转所有安装操作（settings 合并、CLAUDE.md、代理、文件）
 * 5. 从清单中移除该适配器
 *
 * 使用 @clack/prompts 进行交互式确认。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import path from 'node:path';
import { getInstaller, listAdapters } from '../adapters/index.js';
import { readManifest } from '../core/manifest.js';
import { executeUninstall } from '../core/uninstall-engine.js';
import { spinner, intro, outro, note, log, confirm } from '@clack/prompts';
import pc from 'picocolors';

export const uninstallCommand = new Command('uninstall')
  .description('卸载 AI 编码助手的 EvoKit')
  .argument('[adapter]', '适配器名称（claude、codex、opencode）。省略则在仅安装一个时自动选择。')
  .option('--home <path>', '目标主目录（默认：$HOME）')
  .option('--force', '跳过确认提示')
  .option('--purge', '除 EvoKit 管理的文件外，同时删除用户数据（记忆文件、MEMORY.md）')
  .option('--dry-run', '预览卸载，不修改文件')
  .option('--no-backup', '跳过备份创建')
  .option('--backup-dir <path>', '自定义备份目录')
  .action(async (adapterArg: string | undefined, options: any) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      log.error('错误：无法确定主目录。');
      log.error('请设置 $HOME 后重试。');
      process.exit(1);
    }

    // ── 解析适配器 ───────────────────────────────────
    let adapterId: string;

    if (adapterArg) {
      adapterId = adapterArg.trim().toLowerCase();
      // 验证适配器是否存在于注册表中
      try {
        getInstaller(adapterId);
      } catch {
        log.error(`未知适配器："${adapterArg}"`);
        log.error(
          `可用适配器：${listAdapters()
            .map((a) => a.id)
            .join(', ')}`,
        );
        process.exit(1);
      }
    } else {
      // 从清单自动选择
      const manifest = readManifest(homeDir);
      if (!manifest || Object.keys(manifest.adapters).length === 0) {
        log.error('清单中未找到已安装的适配器。');
        log.info('请指定适配器：evokit uninstall claude');
        log.info(
          `可用适配器：${listAdapters()
            .map((a) => a.id)
            .join(', ')}`,
        );
        process.exit(1);
      }

      const installedAdapters = Object.keys(manifest.adapters);
      if (installedAdapters.length === 1) {
        adapterId = installedAdapters[0];
        log.info(`已自动选择适配器：${pc.cyan(adapterId)}`);
      } else {
        log.error('已安装多个适配器。请指定要卸载的适配器：');
        for (const id of installedAdapters) {
          const record = manifest.adapters[id];
          log.info(`  ${pc.cyan(id)} — 安装于 ${record.adapterHome}`);
        }
        process.exit(1);
      }
    }

    // ── 获取适配器信息 ──────────────────────────────────
    const installer = getInstaller(adapterId);
    const manifest = readManifest(homeDir);
    const adapterRecord = manifest?.adapters?.[adapterId];
    const isHeuristic = !manifest || !adapterRecord;

    // ── 显示预览 ──────────────────────────────────────
    intro(pc.bgRed(pc.white(' EvoKit 卸载 ')));

    if (isHeuristic) {
      log.warn(pc.yellow('⚠ 未找到清单 — 使用启发式卸载'));
      log.warn('部分 EvoKit 痕迹可能未被移除。卸载后请运行 `evokit doctor` 验证。');
    }

    const previewLines = buildPreview(adapterId, adapterRecord, homeDir, options.purge);
    note(previewLines.join('\n'), `卸载：${installer.label}`);

    // ── 确认 ──────────────────────────────────────
    if (!options.force && !options.dryRun) {
      const shouldContinue = await confirm({
        message: '确认卸载？',
      });
      if (!shouldContinue) {
        outro('卸载已取消');
        return;
      }
    }

    // ── 执行卸载 ─────────────────────────────────
    const s = spinner();
    s.start(`正在卸载 ${installer.label}...`);

    try {
      const result = executeUninstall({
        homeDir,
        adapterId,
        force: options.force ?? false,
        purge: options.purge ?? false,
        dryRun: options.dryRun ?? false,
        noBackup: options.backup === false,
        backupDir: options.backupDir,
      });

      s.stop(`${installer.label} 已卸载`);

      // 打印结果
      const resultLines = buildResultSummary(result);
      note(resultLines.join('\n'), `EvoKit — 卸载 ${installer.label}`);

      // 打印警告
      for (const warning of result.warnings) {
        log.warn(pc.yellow(`⚠ ${warning}`));
      }

      // 卸载后指引
      if (!options.dryRun) {
        if (result.backupPath) {
          log.info(`📦 备份：${pc.cyan(result.backupPath)}`);
          log.info('   如需恢复，可从此备份还原。');
        }
        log.info(`💡 运行 ${pc.cyan('evokit doctor')} 验证系统健康状态。`);
        log.info(`   ${pc.cyan('~/.evokit/')} 目录可能仍包含备份，如不需要可手动删除。`);
      }
    } catch (err: any) {
      s.stop('卸载失败');
      log.error(`${installer.label}：${err.message}`);
      process.exit(1);
    }

    if (options.dryRun) {
      outro('模拟运行完成 — 未修改任何文件');
    } else {
      outro('EvoKit 已成功卸载');
    }
  });

// ─── 显示辅助函数 ─────────────────────────────────────────

function buildPreview(
  adapterId: string,
  adapterRecord: any,
  homeDir: string,
  purge: boolean,
): string[] {
  const lines: string[] = [];

  if (adapterRecord) {
    // Manifest-driven preview
    const adapterHome = adapterRecord.adapterHome;

    // Count files by category
    const hookFiles = adapterRecord.files.filter(
      (f: any) => f.path.includes('/hooks/') || f.path.includes('\\hooks\\'),
    );
    const ruleFiles = adapterRecord.files.filter(
      (f: any) => f.path.includes('/rules/') || f.path.includes('\\rules\\'),
    );
    const commandFiles = adapterRecord.files.filter(
      (f: any) => f.path.includes('/commands/') || f.path.includes('\\commands\\'),
    );
    const skillFiles = adapterRecord.files.filter((f: any) => f.source === 'copy-skills');
    const memorySeeds = adapterRecord.memorySeeds || [];

    lines.push(pc.red('Will remove:'));
    if (hookFiles.length > 0) lines.push(`  ${hookFiles.length} hook script(s)`);
    if (ruleFiles.length > 0) lines.push(`  ${ruleFiles.length} rule file(s)`);
    if (commandFiles.length > 0) lines.push(`  ${commandFiles.length} command file(s)`);
    if (skillFiles.length > 0) lines.push(`  ${skillFiles.length} skill(s)`);
    if (adapterRecord.hooks?.length > 0)
      lines.push(`  ${adapterRecord.hooks.length} hook entries from settings.json`);
    if (adapterRecord.envVars?.length > 0)
      lines.push(`  ${adapterRecord.envVars.length} env var(s) from settings.json`);
    if (adapterRecord.agentFrontmatter?.length > 0)
      lines.push(`  ${adapterRecord.agentFrontmatter.length} agent frontmatter entries`);
    if (memorySeeds.length > 0) lines.push(`  memory/README.md (seed file)`);
    lines.push(`  EvoKit section from ~/CLAUDE.md`);

    lines.push('');
    lines.push(pc.green('Will preserve:'));
    if (!purge) {
      lines.push('  Memory data (corrections, observations, sessions, etc.)');
      lines.push('  MEMORY.md');
      lines.push('  learned-rules.md, evolution-log.md');
    } else {
      lines.push(pc.yellow('  ⚠ --purge: user data will also be deleted'));
    }
  } else {
    // Heuristic preview
    lines.push(pc.red('Will remove (heuristic):'));
    lines.push('  Hook scripts (~/.claude/hooks/)');
    lines.push('  Rule files (~/.claude/rules/)');
    lines.push('  Command files (~/.claude/commands/)');
    lines.push('  Skills directory (~/.claude/skills/)');
    lines.push('  EvoKit hooks from settings.json');
    lines.push('  EvoKit section from ~/CLAUDE.md');
    lines.push('  memory/README.md (seed file)');
    lines.push('');
    lines.push(pc.yellow('⚠ Heuristic mode — may miss some EvoKit traces'));
  }

  return lines;
}

function buildResultSummary(result: any): string[] {
  const lines: string[] = [];

  lines.push(`Files deleted: ${result.filesDeleted}`);
  lines.push(`Files preserved: ${result.filesPreserved}`);
  if (result.hooksRemoved > 0) lines.push(`Hooks removed: ${result.hooksRemoved}`);
  if (result.envVarsRemoved > 0) lines.push(`Env vars removed: ${result.envVarsRemoved}`);
  if (result.agentFieldsRemoved > 0)
    lines.push(`Agent fields removed: ${result.agentFieldsRemoved}`);
  if (result.directoriesRemoved > 0) lines.push(`Empty dirs removed: ${result.directoriesRemoved}`);
  if (result.heuristic) lines.push(pc.yellow('Mode: heuristic (no manifest)'));

  return lines;
}
