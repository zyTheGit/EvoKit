/**
 * EvoKit — Review 命令（主动过期复审）
 *
 * `evokit review` 作为分布式过期检测的"用户主动发起（/evokit-review）"触发点：
 * 列出 confidence ≤ 0.5（STALE / RETIRED，见 #26 三档状态机）的知识条目，
 * 对每条提供：回升（复审确认仍有效 → FRESH）、降分（→ RETIRED）、删除。
 *
 * 与三档状态机协同：置信度转移通过 `transitionConfidence`，确保只落在合法档位。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { intro, log, select, isCancel, cancel, note, outro } from '@clack/prompts';
import { resolveHomeDir } from './shared.js';
import { getPersonalKnowledgeRoot, getProjectKnowledgeRoot } from '../core/memory.js';
import {
  writeKnowledgeEntry,
  readKnowledgeIndex,
  writeKnowledgeIndex,
  transitionConfidence,
} from '../core/knowledge.js';
import { KnowledgeRepository } from '../core/repository.js';
import type { KnowledgeEntry } from '../core/types.js';

const FRONTMATTER_DELIMITER = '---';

/** 待复审条目（含来源路径，便于写回/删除） */
export interface ReviewCandidate {
  entry: KnowledgeEntry;
  /** 条目文件所在 knowledge 目录 */
  knowledgeDir: string;
  /** 该 knowledge 目录对应的 knowledge-index.md 路径 */
  indexPath: string;
}

/**
 * 从 knowledge 目录扫描 confidence ≤ STALE 的条目（#34 待复审名单）。
 * 供 `evokit review` 全量复审名单。
 * 统一走 KnowledgeRepository.collectStale（单一数据访问层，范畴 B）。
 */
export function collectStaleEntries(knowledgeRoots: string[]): ReviewCandidate[] {
  const candidates: ReviewCandidate[] = [];

  for (const knowledgeRoot of knowledgeRoots) {
    const repo = new KnowledgeRepository({ knowledgeRoot });
    // 跨个人+项目目录共享的待复审名单定义（confidence ≤ 0.5）
    for (const entry of repo.collectStale()) {
      candidates.push({ entry, knowledgeDir: repo.knowledgeDir, indexPath: repo.indexPath });
    }
  }

  // 排序：confidence 升序（最可疑的 RETIRED 在前）→ 同档内按 updated 升序
  // （先看最久未复审的；无 updated 时回退 created，ADR 0003 复审调度）
  return candidates.sort((a, b) => {
    const byConfidence = a.entry.confidence - b.entry.confidence;
    if (byConfidence !== 0) return byConfidence;
    const aDate = a.entry.updated ?? a.entry.created;
    const bDate = b.entry.updated ?? b.entry.created;
    return aDate.localeCompare(bDate);
  });
}

/**
 * 读取条目正文 body（frontmatter 之后的部分）。
 * 写回时用于保留正文内容。
 */
export function readEntryBody(filePath: string): string {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    // 找到第二个 '---' 分隔符（frontmatter 结束）
    const first = raw.indexOf(FRONTMATTER_DELIMITER);
    const second = raw.indexOf(FRONTMATTER_DELIMITER, first + FRONTMATTER_DELIMITER.length);
    if (first !== -1 && second !== -1) {
      return raw.slice(second + FRONTMATTER_DELIMITER.length).trim();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * 从索引中移除指定 id 的行。
 * target: 'evokit' | 'claude'。EvoKit 知识条目默认在 evokit 段。
 */
export function removeIndexEntry(
  indexPath: string,
  id: string,
  target: 'evokit' | 'claude' = 'evokit',
): void {
  const { evokit, claude } = readKnowledgeIndex(indexPath);
  const source = target === 'evokit' ? evokit : claude;
  const filtered = source.filter((line) => {
    const match = line.match(/^- \[([^\]]+)\]/);
    return !(match && match[1] === id);
  });
  const next = target === 'evokit' ? filtered : evokit;
  const nextClaude = target === 'claude' ? filtered : claude;
  writeKnowledgeIndex(indexPath, next, nextClaude);
}

/**
 * 对单条执行复审动作，写回条目文件并同步索引（如有改动）。
 *
 * @param candidate 待复审条目
 * @param action confirm（回升→FRESH）| retire（降分→RETIRED）| delete（删除）
 * @param dryRun 只返回结果，不落盘
 * @returns 动作后的置信度（delete 返回 null）
 */
export function applyReviewAction(
  candidate: ReviewCandidate,
  action: 'confirm' | 'retire' | 'delete',
  dryRun = false,
): { confidence: number | null; filePath: string } {
  const { entry, knowledgeDir, indexPath } = candidate;
  const filePath = path.join(knowledgeDir, `${entry.id}.md`);

  if (action === 'delete') {
    if (!dryRun) {
      fs.rmSync(filePath, { force: true });
      // 从索引移除该条目（EvoKit 段）
      removeIndexEntry(indexPath, entry.id, 'evokit');
    }
    return { confidence: null, filePath };
  }

  // confirm / retire：通过状态机转移到目标档位
  const event = action === 'confirm' ? 'review-confirm' : 'review-doubtful';
  const nextConfidence = transitionConfidence(entry.confidence, event);
  const body = readEntryBody(filePath);
  const updated: KnowledgeEntry = {
    ...entry,
    confidence: nextConfidence,
    updated: new Date().toISOString().slice(0, 10),
  };

  if (!dryRun) {
    writeKnowledgeEntry(filePath, updated, body);
  }
  return { confidence: nextConfidence, filePath };
}

export const reviewCommand = new Command('review')
  .description('复审过期的知识条目（confidence ≤ 0.5）')
  .option('--home <path>', '目标主目录（默认：$HOME）')
  .option(
    '--adapter <name>',
    '适配器名称（claude | codex | opencode | pi）用于解析个人 memory 目录',
    'claude',
  )
  .option('--project-dir <path>', '项目知识目录（扫描项目级记忆，默认仅个人级）')
  .option('--dry-run', '预览复审操作，不修改文件')
  .addHelpText(
    'after',
    `
复审操作：
  对每条 STALE / RETIRED 条目提供：
    确认回升  — 复审后仍有效，confidence → FRESH(0.9)
    降分      — 复审后存疑，confidence → RETIRED(0.1)
    删除      — 该知识不再适用，删除条目文件并从索引移除

示例：
  evokit review                     复审个人级过期条目
  evokit review --project-dir .    复审当前项目级过期条目
  evokit review --dry-run          仅列出，不修改
`,
  )
  .action(async (options) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`错误：${msg}`);
      process.exit(1);
    }

    const dryRun = options.dryRun === true;

    // 个人知识根：agent 无关（共享 ~/.evokit/knowledge/），不再按 adapter 分叉
    const knowledgeRoots: string[] = [getPersonalKnowledgeRoot(homeDir)];
    const projectDir = options.projectDir as string | undefined;
    if (projectDir) {
      knowledgeRoots.push(getProjectKnowledgeRoot(path.join(projectDir)));
    }

    const candidates = collectStaleEntries(knowledgeRoots);

    intro(pc.bgYellow(pc.black(' EvoKit 知识复审 ')));

    if (candidates.length === 0) {
      log.success('没有需要复审的条目（无 confidence ≤ 0.5 的知识）。');
      outro('复审完成');
      return;
    }

    if (dryRun) {
      const lines = candidates.map(
        (c, i) =>
          `${i + 1}. [${pc.red(String(c.entry.confidence))}] ${pc.dim(c.entry.id)} — ${c.entry.context ?? ''}`,
      );
      note(lines.join('\n'), `待复审条目（${candidates.length}，--dry-run 未修改）`);
      outro('预览完成');
      return;
    }

    let confirmed = 0;
    let retired = 0;
    let deleted = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const { entry } = candidate;
      const label = `${entry.id} (confidence=${entry.confidence})${entry.context ? ` — ${entry.context}` : ''}`;
      const action = await select({
        message: `如何复审：${label}`,
        options: [
          { value: 'confirm', label: '确认回升 → FRESH (0.9)' },
          {
            value: 'retire',
            label: `降分 → RETIRED (0.1)${entry.confidence <= 0.1 ? '（已是 RETIRED）' : ''}`,
          },
          { value: 'delete', label: '删除条目' },
          { value: 'skip', label: '跳过' },
        ],
      });
      if (isCancel(action)) {
        cancel('复审已取消');
        process.exit(0);
      }

      if (action === 'skip') {
        skipped++;
        continue;
      }
      if (action === 'confirm') confirmed++;
      if (action === 'retire') retired++;
      if (action === 'delete') deleted++;

      applyReviewAction(candidate, action as 'confirm' | 'retire' | 'delete');
    }

    summary(confirmed, retired, deleted, skipped);
    outro('复审完成');
  });

function summary(confirmed: number, retired: number, deleted: number, skipped: number): void {
  note(
    [
      `确认回升：${confirmed} 条`,
      `降分：${retired} 条`,
      `删除：${deleted} 条`,
      `跳过：${skipped} 条`,
    ].join('\n'),
    '复审结果',
  );
}
