/**
 * EvoKit — Migrate 命令
 *
 * `evokit migrate` 命令：
 * 1. 检测旧数据文件（learned-rules.md, corrections.jsonl 等）
 * 2. 解析 learned-rules.md → KnowledgeEntry[]
 * 3. 批量展示待确认列表
 * 4. 用户确认后写入 knowledge/
 * 5. 归档旧文件到 evokit/archive/v0/
 * 6. 更新 knowledge-index.md
 *
 * 使用 @clack/prompts 进行交互式确认。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { intro, log, confirm, isCancel, cancel, note, select } from '@clack/prompts';
import { resolveHomeDir } from './shared.js';
import { getMemoryDir } from '../core/memory.js';
import {
  parseLearnedRulesForMigration,
  convertRuleToMigrated,
  getKnowledgeDir,
  getKnowledgeIndexPath,
  getArchiveV0Dir,
  writeKnowledgeEntry,
  appendToKnowledgeIndex,
  archiveFileToV0,
  listKnowledgeEntries,
} from '../core/knowledge.js';
import type { KnowledgeScope, MigrationDetection, MigratedRule } from '../core/types.js';

/** 需要检测和归档的旧文件列表 */
const LEGACY_FILES = [
  'learned-rules.md',
  'corrections.jsonl',
  'observations.jsonl',
  'evolution-log.md',
  'violations.jsonl',
] as const;

/**
 * 检测旧数据文件是否存在。
 */
export function detectLegacyData(memoryDir: string): MigrationDetection {
  const paths: Record<string, string> = {};
  const detection: MigrationDetection = {
    learnedRules: false,
    corrections: false,
    observations: false,
    evolutionLog: false,
    violations: false,
    paths,
  };

  for (const file of LEGACY_FILES) {
    const filePath = path.join(memoryDir, file);
    if (fs.existsSync(filePath)) {
      paths[file] = filePath;
      switch (file) {
        case 'learned-rules.md':
          detection.learnedRules = true;
          break;
        case 'corrections.jsonl':
          detection.corrections = true;
          break;
        case 'observations.jsonl':
          detection.observations = true;
          break;
        case 'evolution-log.md':
          detection.evolutionLog = true;
          break;
        case 'violations.jsonl':
          detection.violations = true;
          break;
      }
    }
  }

  return detection;
}

/**
 * 解析 learned-rules.md 并转换为 MigratedRule 列表。
 * deprecated 条目被过滤，无法解析的跳过并警告。
 */
export function parseAndConvertRules(
  learnedRulesPath: string,
  scope: KnowledgeScope,
  knowledgeDir: string,
): { rules: MigratedRule[]; warnings: string[] } {
  const content = fs.readFileSync(learnedRulesPath, 'utf-8');
  const parsed = parseLearnedRulesForMigration(content);
  const rules: MigratedRule[] = [];
  const warnings: string[] = [];

  for (const item of parsed) {
    if (item.deprecated) {
      warnings.push(`跳过已废弃规则："${item.description}"`);
      continue;
    }

    try {
      const migrated = convertRuleToMigrated(item, scope, knowledgeDir);
      rules.push(migrated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`无法转换规则："${item.description}" — ${msg}`);
    }
  }

  return { rules, warnings };
}

/**
 * 执行迁移：写入知识条目 + 归档旧文件 + 更新索引。
 */
export function executeMigration(
  acceptedRules: MigratedRule[],
  detection: MigrationDetection,
  memoryDir: string,
  dryRun: boolean,
): { entriesWritten: number; filesArchived: number } {
  const knowledgeDir = getKnowledgeDir(memoryDir);
  const indexPath = getKnowledgeIndexPath(memoryDir);
  const archiveDir = getArchiveV0Dir(memoryDir);

  let entriesWritten = 0;
  let filesArchived = 0;

  // 写入知识条目
  for (const rule of acceptedRules) {
    const filePath = path.join(knowledgeDir, `${rule.entry.id}.md`);
    const body =
      rule.originalDescription !== rule.entry.context
        ? `## 内容\n\n${rule.originalDescription}`
        : `## 内容\n\n${rule.originalDescription}`;

    if (!dryRun) {
      writeKnowledgeEntry(filePath, rule.entry, body);
      appendToKnowledgeIndex(indexPath, rule.entry.id, rule.originalDescription);
    }
    entriesWritten++;
  }

  // 归档旧文件
  for (const [file, filePath] of Object.entries(detection.paths)) {
    if (!dryRun) {
      const archived = archiveFileToV0(filePath, archiveDir);
      if (archived) filesArchived++;
    } else {
      filesArchived++;
    }
  }

  return { entriesWritten, filesArchived };
}

export const migrateCommand = new Command('migrate')
  .description('迁移旧数据为 v1.0 知识条目格式')
  .option('--home <path>', '目标主目录（默认：$HOME）')
  .option('--adapter <name>', '适配器名称（claude | codex | opencode | pi）', 'claude')
  .option('--scope <scope>', '知识条目作用域（personal | project）', 'personal')
  .option('--dry-run', '预览迁移，不修改文件')
  .option('--force', '跳过确认提示')
  .addHelpText(
    'after',
    `
迁移策略：
  检测旧数据    — learned-rules.md、corrections.jsonl、observations.jsonl 等
  解析转换      — learned-rules.md 条目 → v1.0 知识条目（convention 类型）
  批量确认      — 展示待确认列表，用户选择接受/拒绝
  归档旧文件    — 移动到 evokit/archive/v0/（不删除）
  更新索引      — 写入 knowledge-index.md

选项说明：
  --adapter     指定适配器，默认 claude
  --scope       知识条目作用域，默认 personal
  --dry-run     仅预览迁移结果，不实际修改
  --force       跳过确认提示，自动接受所有条目

注意：
  此操作将转换旧数据为 v1.0 格式，旧文件归档到 evokit/archive/v0/。
  v1.0 不支持自动降级。归档保留了原始数据，技术上可手动恢复。

示例：
  evokit migrate                 交互式迁移
  evokit migrate --dry-run       预览迁移结果
  evokit migrate --force         跳过确认，自动接受`,
  )
  .action(async (options: Record<string, unknown>) => {
    const adapterId = (options.adapter as string) || 'claude';
    const scope = (options.scope as KnowledgeScope) || 'personal';
    const dryRun = options.dryRun === true;
    const force = options.force === true;

    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home as string | undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`错误：${msg}`);
      process.exit(1);
    }

    const memoryDir = getMemoryDir(homeDir, adapterId);

    // ── 检测旧数据 ──────────────────────────────────
    const detection = detectLegacyData(memoryDir);
    const hasLegacy = Object.values(detection.paths).length > 0;

    if (!hasLegacy) {
      log.info('未检测到旧数据文件，无需迁移。');
      process.exit(0);
    }

    intro(pc.bgCyan(pc.black(' EvoKit 数据迁移 ')));

    // ── 显示检测到的旧文件 ──────────────────────────
    const detectedLines: string[] = [];
    for (const [file, filePath] of Object.entries(detection.paths)) {
      detectedLines.push(`  ${pc.cyan(file)} — ${filePath}`);
    }
    note(detectedLines.join('\n'), '检测到的旧数据文件');

    // ── 不可逆提示 ──────────────────────────────────
    if (!force) {
      log.warn('此操作将转换旧数据为 v1.0 格式，旧文件归档到 evokit/archive/v0/。');
      log.warn('v1.0 不支持自动降级。归档保留了原始数据，技术上可手动恢复。');

      const shouldContinue = await confirm({
        message: '确认继续迁移？',
      });
      if (isCancel(shouldContinue) || !shouldContinue) {
        cancel('迁移已取消');
        process.exit(0);
      }
    }

    // ── 解析 learned-rules.md ────────────────────────
    let rules: MigratedRule[] = [];
    const warnings: string[] = [];

    if (detection.learnedRules) {
      const knowledgeDir = getKnowledgeDir(memoryDir);
      const result = parseAndConvertRules(detection.paths['learned-rules.md'], scope, knowledgeDir);
      rules = result.rules;
      warnings.push(...result.warnings);
    }

    // 显示警告
    for (const w of warnings) {
      log.warn(w);
    }

    // ── 展示待确认列表 ──────────────────────────────
    if (rules.length === 0) {
      if (detection.learnedRules) {
        log.info('learned-rules.md 中无可迁移的规则（可能为空或全部已废弃）。');
      }
      // 仍然归档旧文件
      const archiveDir = getArchiveV0Dir(memoryDir);
      let archived = 0;
      for (const [file, filePath] of Object.entries(detection.paths)) {
        if (!dryRun) {
          if (archiveFileToV0(filePath, archiveDir)) archived++;
        } else {
          archived++;
        }
      }
      if (archived > 0) {
        log.success(`已归档 ${archived} 个旧文件到 evokit/archive/v0/`);
      }
      return;
    }

    // 展示规则列表
    const ruleLines: string[] = [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const typeLabel = pc.cyan(`[${r.entry.type}]`);
      const idLabel = pc.dim(r.entry.id);
      ruleLines.push(`${i + 1}. ${typeLabel} ${r.originalDescription} ${idLabel}`);
      if (r.note) {
        ruleLines.push(`   ${pc.dim(r.note)}`);
      }
    }
    note(ruleLines.join('\n'), '迁移 learned-rules.md → 知识条目');

    // ── 用户确认 ────────────────────────────────────
    let acceptedRules: MigratedRule[];

    if (force) {
      acceptedRules = rules;
    } else {
      const answer = await select({
        message: '选择操作',
        options: [
          { value: 'all', label: '全部接受 (a)' },
          { value: 'none', label: '全部拒绝 (n)' },
          { value: 'review', label: '逐条审查' },
        ],
      });

      if (isCancel(answer)) {
        cancel('迁移已取消');
        process.exit(0);
      }

      if (answer === 'all') {
        acceptedRules = rules;
      } else if (answer === 'none') {
        log.info('已拒绝所有迁移条目。旧文件保留原位。');
        return;
      } else {
        // 逐条审查
        acceptedRules = [];
        for (const rule of rules) {
          const accept = await confirm({
            message: `接受？ [${rule.entry.type}] ${rule.originalDescription}`,
          });
          if (accept === true) {
            acceptedRules.push(rule);
          }
        }
        if (acceptedRules.length === 0) {
          log.info('未接受任何条目。旧文件保留原位。');
          return;
        }
      }
    }

    // ── 执行迁移 ────────────────────────────────────
    const result = executeMigration(acceptedRules, detection, memoryDir, dryRun);

    // ── 摘要 ────────────────────────────────────────
    const summaryLines: string[] = [];
    summaryLines.push(`知识条目：${dryRun ? '将写入' : '已写入'} ${result.entriesWritten} 个`);
    summaryLines.push(
      `旧文件归档：${dryRun ? '将归档' : '已归档'} ${result.filesArchived} 个到 evokit/archive/v0/`,
    );
    if (dryRun) {
      summaryLines.push(pc.yellow('（试运行 — 未修改任何文件）'));
    }
    note(summaryLines.join('\n'), '迁移结果');

    if (!dryRun) {
      log.success('迁移完成！');
      log.info(`运行 ${pc.cyan('evokit doctor')} 验证系统健康状态。`);
    }
  });
