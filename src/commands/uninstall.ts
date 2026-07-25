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
import { getInstaller, listAdapters } from '../adapters/index.js';
import type { AdapterInstaller } from '../adapters/types.js';
import { readManifest } from '../core/manifest.js';
import { executeUninstall } from '../core/uninstall-engine.js';
import { spinner, intro, outro, note, log, confirm, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { resolveHomeDir, resolveAdapter } from './shared.js';

export const uninstallCommand = new Command('uninstall')
  .description('卸载 AI 编码助手的 EvoKit')
  .argument(
    '[adapter]',
    '适配器名称（claude、codex、opencode、pi）。省略则在仅安装一个时自动选择。',
  )
  .option('--home <path>', '目标主目录（默认：$HOME）')
  .option('--force', '跳过确认提示')
  .option('--purge', '除 EvoKit 管理的文件外，同时删除用户数据（记忆文件、MEMORY.md）')
  .option('--dry-run', '预览卸载，不修改文件')
  .option('--no-backup', '跳过备份创建')
  .option('--backup-dir <path>', '自定义备份目录')
  .addHelpText(
    'after',
    `
卸载模式：
  清单驱动  — 优先使用 ~/.evokit/manifest.json 精确还原安装
  启发式    — 清单缺失时，根据适配器已知结构推断卸载

选项说明：
  --purge       同时删除用户数据（记忆文件、MEMORY.md、learned-rules.md）
  --dry-run     仅预览将删除的文件，不实际修改
  --no-backup   跳过备份（默认备份到 ~/.evokit/backup/）
  --force       跳过确认提示

示例：
  evokit uninstall claude              交互式卸载 Claude Code
  evokit uninstall opencode --dry-run  预览 OpenCode 卸载
  evokit uninstall claude --purge      卸载并删除用户数据

卸载后：
  运行 evokit doctor 验证系统状态
  备份位于 ~/.evokit/backup/uninstall-YYYYMMDD/`,
  )
  .action(async (adapterArg: string | undefined, options: any) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home });
    } catch (err: any) {
      log.error(`错误：${err.message}`);
      process.exit(1);
    }

    // ── 解析适配器 ───────────────────────────────────
    let adapterId: string;

    if (adapterArg) {
      adapterId = adapterArg.trim().toLowerCase();
      // 验证适配器是否存在于注册表中
      const resolved = resolveAdapter(adapterId);
      if (!resolved.ok) {
        log.error(resolved.error.message);
        log.error(resolved.error.availableAdapters);
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

    const previewLines = buildPreview(adapterId, adapterRecord, homeDir, options.purge, installer);
    note(previewLines.join('\n'), `卸载：${installer.label}`);

    // ── 确认 ──────────────────────────────────────
    if (!options.force && !options.dryRun) {
      const shouldContinue = await confirm({
        message: '确认卸载？',
      });
      if (isCancel(shouldContinue) || !shouldContinue) {
        cancel('卸载已取消');
        process.exit(0);
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
        adapter: installer, // 传入适配器实例，避免通过 registry 查找
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

/** 将绝对路径转为 ~/ 简写形式 */
function tildePath(absPath: string, homeDir: string): string {
  if (absPath.startsWith(homeDir)) {
    return '~' + absPath.slice(homeDir.length);
  }
  return absPath;
}

function buildPreview(
  adapterId: string,
  adapterRecord: any,
  homeDir: string,
  purge: boolean,
  installer: AdapterInstaller,
): string[] {
  const lines: string[] = [];

  if (adapterRecord) {
    // Manifest-driven preview
    const adapterHome = adapterRecord.adapterHome;
    const displayHome = tildePath(adapterHome, homeDir);

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

    lines.push(pc.red('将移除：'));
    if (hookFiles.length > 0) lines.push(`  ${hookFiles.length} 个钩子脚本`);
    if (ruleFiles.length > 0) lines.push(`  ${ruleFiles.length} 个规则文件`);
    if (commandFiles.length > 0) lines.push(`  ${commandFiles.length} 个命令文件`);
    if (skillFiles.length > 0) lines.push(`  ${skillFiles.length} 个技能`);
    if (adapterRecord.hooks?.length > 0)
      lines.push(`  ${adapterRecord.hooks.length} 个 settings.json 钩子条目`);
    if (adapterRecord.envVars?.length > 0)
      lines.push(`  ${adapterRecord.envVars.length} 个 settings.json 环境变量`);
    if (adapterRecord.agentFrontmatter?.length > 0)
      lines.push(`  ${adapterRecord.agentFrontmatter.length} 个代理 frontmatter 条目`);
    if (memorySeeds.length > 0) lines.push('  memory/README.md（种子文件）');
    lines.push(`  ${displayHome} 中的 EvoKit 区段`);

    lines.push('');
    lines.push(pc.green('将保留：'));
    if (!purge) {
      lines.push('  用户数据（修正、观察、会话等）');
      lines.push('  MEMORY.md');
      lines.push('  learned-rules.md、evolution-log.md');
    } else {
      lines.push(pc.yellow('  ⚠ --purge：用户数据也将被删除'));
    }
  } else {
    // Heuristic preview — 根据适配器动态生成
    const adapterHome = installer.resolveHome(homeDir);
    const displayHome = tildePath(adapterHome, homeDir);
    const heuristicConfig = installer.getHeuristicConfig(adapterHome);

    lines.push(pc.red('将移除（启发式）：'));

    // 已知目录
    for (const dirConfig of heuristicConfig.knownDirs) {
      const dirDisplay = `${displayHome}/${dirConfig.name}/`;
      const extHint = dirConfig.extension ? `（*${dirConfig.extension}）` : '';
      lines.push(`  ${dirDisplay}${extHint}`);
    }

    // 配置文件
    for (const cfgFile of heuristicConfig.configFiles) {
      lines.push(`  ${displayHome}/${cfgFile}`);
    }

    // 认知核心文件
    if (heuristicConfig.cognitiveCorePath) {
      lines.push(`  ${tildePath(heuristicConfig.cognitiveCorePath, homeDir)}`);
    }

    // Skills 目录
    if (heuristicConfig.skillsDir) {
      lines.push(`  ${tildePath(heuristicConfig.skillsDir, homeDir)}/`);
    }

    // memory/README.md
    lines.push(`  ${displayHome}/memory/README.md（种子文件）`);

    lines.push('');
    lines.push(pc.green('将保留：'));
    if (!purge) {
      lines.push('  用户数据（修正、观察、会话等）');
      lines.push('  MEMORY.md');
      lines.push('  learned-rules.md、evolution-log.md');
    } else {
      lines.push(pc.yellow('  ⚠ --purge：用户数据也将被删除'));
    }

    lines.push('');
    lines.push(pc.yellow('⚠ 启发式模式 — 可能遗漏部分 EvoKit 痕迹'));
  }

  return lines;
}

function buildResultSummary(result: any): string[] {
  const lines: string[] = [];

  lines.push(`已删除文件：${result.filesDeleted}`);
  lines.push(`已保留文件：${result.filesPreserved}`);
  if (result.hooksRemoved > 0) lines.push(`已移除钩子：${result.hooksRemoved}`);
  if (result.envVarsRemoved > 0) lines.push(`已移除环境变量：${result.envVarsRemoved}`);
  if (result.agentFieldsRemoved > 0) lines.push(`已移除代理字段：${result.agentFieldsRemoved}`);
  if (result.directoriesRemoved > 0) lines.push(`已清理空目录：${result.directoriesRemoved}`);
  if (result.heuristic) lines.push(pc.yellow('模式：启发式（无清单）'));

  return lines;
}
