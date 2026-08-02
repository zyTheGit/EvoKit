/**
 * EvoKit — Learn 命令（知识提取与确认背书）
 *
 * `evokit learn` 是对话提取"确认唯一闸门"的触发入口（#25 双路径定稿）：
 *
 * 1. `evokit learn`（无内容参数）— 确认背书路径：列出 `.pending/` 待确认草稿，
 *    逐条确认/拒绝 + 裁定 scope，确认后转成 KnowledgeEntry 移入 knowledge/ 并更新索引
 *    （#25 / #31 D5）。静默标记的候选在此被人工确认背书后入库。
 * 2. `evokit learn "内容"`（有内容参数）— 显式声明路径：用户发起即当场背书
 *    （source=explicit, confidence=FRESH, 默认项目 scope），直接写入 knowledge/。
 *
 * 均经 KnowledgeRepository 单一数据访问层（范畴 B），领域模型锚点不变。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { intro, log, note, outro, select, isCancel, cancel } from '@clack/prompts';
import { resolveHomeDir } from './shared.js';
import { getMemoryDir } from '../core/memory.js';
import {
  KnowledgeRepository,
  ensureArchitectureAnnotation,
} from '../core/repository.js';
import type { KnowledgeScope, KnowledgeType } from '../core/types.js';
import { generateSlug, KnowledgeConfidence } from '../core/knowledge.js';

/** 待确认候选（含来源 repo，便于确认/拒绝后写回） */
export interface PendingCandidate {
  repo: KnowledgeRepository;
  memoryDir: string;
  id: string;
  type: KnowledgeType;
  context?: string;
  content: string;
}

/**
 * 收集指定 memory 目录的全部待确认草稿（#25 确认路径）。
 * 统一走 KnowledgeRepository 单一数据访问层。
 */
export function listPendingCandidates(memoryDirs: string[]): PendingCandidate[] {
  const out: PendingCandidate[] = [];
  for (const memoryDir of memoryDirs) {
    const repo = new KnowledgeRepository({ memoryDir });
    for (const id of repo.listPending()) {
      const pending = repo.getPending(id);
      if (!pending) continue;
      out.push({
        repo,
        memoryDir,
        id,
        type: pending.type,
        context: pending.context,
        content: pending.context ?? id,
      });
    }
  }
  return out;
}

/**
 * 确认一条待确认草稿 → 背书入库。
 * 补齐 scope（人工裁定）+ confidence FRESH + updated，写 knowledge/，删草稿，更新索引。
 * @returns 生成的已入库 KnowledgeEntry；草稿不存在返回 null。
 */
export function confirmPendingCandidate(
  memoryDir: string,
  id: string,
  scope: KnowledgeScope,
) {
  const repo = new KnowledgeRepository({ memoryDir });
  return repo.confirmDraft(id, scope);
}

/** 拒绝一条待确认草稿（从 .pending/ 删除）。返回是否确实删除。 */
export function rejectPendingCandidate(memoryDir: string, id: string): boolean {
  const repo = new KnowledgeRepository({ memoryDir });
  return repo.rejectDraft(id);
}

/**
 * 显式声明一条知识（#25 当场背书路径）。
 * 用户带内容发起即当场背书：source=explicit、confidence=FRESH、scope 由用户明确（缺省 project）。
 * 直接写入 knowledge/ + 更新索引，不经过 .pending/。
 *
 * @returns 生成的已入库 KnowledgeEntry。
 */
export function declareExplicit(
  memoryDir: string,
  opts: {
    type: KnowledgeType;
    content: string;
    scope: KnowledgeScope;
    context?: string;
    /** 架构型显式声明的推理标注（#33）：写到 `## 影响范围` */
    impact?: string;
  },
) {
  const repo = new KnowledgeRepository({ memoryDir });
  const slug = uniqueActiveId(repo, opts.type, opts.content);
  const entry = {
    id: slug,
    scope: opts.scope,
    type: opts.type,
    source: 'explicit' as const,
    confidence: KnowledgeConfidence.FRESH,
    created: new Date().toISOString().slice(0, 10),
    context: opts.context,
  };
  const filePath = path.join(repo.knowledgeDir, `${slug}.md`);
  let content = `## 内容\n\n${opts.content}`;
  // 架构型：带入用户提供的 impact 标注；缺省则补最小占位（#33 写路径强制）
  if (opts.type === 'architecture' && opts.impact) {
    content = `${content}\n\n## 影响范围\n\n${opts.impact}`;
  } else if (opts.type === 'architecture') {
    content = ensureArchitectureAnnotation(opts.type, content).body;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeActiveFrontmatter(filePath, entry, content);
  repo.ensureDirs();
  // 索引作为派生物：再生成（架构型带追索标记 #33）
  repo.regenerateIndex();
  return entry;
}

/** 生成跨 knowledge/+pending 去重的唯一 active id（与 #31 D2 一致）。 */
function uniqueActiveId(
  repo: KnowledgeRepository,
  type: KnowledgeType,
  content: string,
): string {
  const slug = generateSlug(content);
  const base = `${type}-${slug}`;
  const used = new Set(repo.listAll());
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/** 在 active 条目文件写入 frontmatter（无 status，scope/confidence 齐备）。 */
function writeActiveFrontmatter(
  filePath: string,
  entry: {
    id: string;
    scope: string;
    type: string;
    source: string;
    confidence: number;
    created: string;
    context?: string;
  },
  body: string,
): void {
  const lines = ['---'];
  lines.push(`id: ${entry.id}`);
  lines.push(`scope: ${entry.scope}`);
  lines.push(`type: ${entry.type}`);
  lines.push(`source: ${entry.source}`);
  lines.push(`confidence: ${entry.confidence}`);
  lines.push(`created: ${entry.created}`);
  if (entry.context) lines.push(`context: ${entry.context}`);
  lines.push('---', '', body);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

export const learnCommand = new Command('learn')
  .description('知识提取确认背书 / 显式声明（对话提取确认闸门）')
  .argument('[content]', '显式声明内容（提供时即当场背书入库，否则进入确认流程）')
  .option('--home <path>', '目标主目录（默认：$HOME）')
  .option(
    '--adapter <name>',
    '适配器名称（claude | codex | opencode | pi）用于解析个人 memory 目录',
    'claude',
  )
  .option('--project-dir <path>', '项目知识目录（追加扫描项目级待确认，默认仅个人级）')
  .option('--scope <scope>', '作用域（personal | project），确认时缺省按当前项目')
  .option('--type <type>', '显式声明的知识类型（默认 convention）', 'convention')
  .option('--impact <text>', '架构型显式声明的推理标注（## 影响范围，type=architecture 时建议提供）')
  .addHelpText(
    'after',
    `
两种用法：
  evokit learn                   确认背书：列出 .pending/ 待确认草稿，逐条确认/拒绝 + 裁定 scope
  evokit learn "使用 uv 代替 pip"   显式声明：用户发起即当场背书，直接写入 knowledge/

示例：
  evokit learn                       确认个人级待确认知识
  evokit learn --project-dir .       确认当前项目级待确认知识
  evokit learn "packages/api 是上游" --type architecture --scope project
`,
  )
  .action(async (content: string | undefined, options) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`错误：${msg}`);
      process.exit(1);
    }

    const adapterId = (options.adapter as string) || 'claude';
    const memoryDirs: string[] = [getMemoryDir(homeDir, adapterId)];
    const projectDir = options.projectDir as string | undefined;

    intro(pc.bgGreen(pc.black(' EvoKit Learn — 知识提取与确认 ')));

    // ── 显式声明路径（有 content）────────────────────────
    if (content) {
      const scope = (options.scope as KnowledgeScope) ?? 'project';
      const type = (options.type as KnowledgeType) ?? 'convention';
      const impact = options.impact as string | undefined;
      const memoryDir = projectDir
        ? getMemoryDir(path.join(projectDir), adapterId)
        : memoryDirs[0];
      const entry = declareExplicit(memoryDir, { type, content, scope, impact });
      log.success(`已声明知识 [${entry.type}] ${entry.id}（scope=${entry.scope}，当场背书）`);
      if (type === 'architecture' && !impact) {
        log.warn('架构型条目已补最小影响范围占位——建议补充具体影响（--impact），并加 ## 相关决策。');
      }
      outro('Learn 完成');
      return;
    }

    // ── 确认背书路径（无 content）────────────────────────
    if (projectDir) {
      memoryDirs.push(getMemoryDir(path.join(projectDir), adapterId));
    }
    const candidates = listPendingCandidates(memoryDirs);

    if (candidates.length === 0) {
      log.info('没有待确认的知识条目。运行 /evokit-learn 或对话中识别后静默写入 .pending/。');
      outro('Learn 完成');
      return;
    }

    note(
      `共 ${candidates.length} 条待确认草稿`,
      '待确认知识（运行 /evokit-learn 确认背书）',
    );

    let confirmed = 0;
    let rejected = 0;

    for (const c of candidates) {
      const label = `[${c.type}] ${c.id} — ${c.content}`;
      const action = await select({
        message: `如何确认：${label}`,
        options: [
          { value: 'confirm', label: `确认 → 入库（scope=${options.scope ?? 'project'}）` },
          { value: 'reject', label: '拒绝 → 删除草稿' },
          { value: 'skip', label: '跳过' },
        ],
      });
      if (isCancel(action)) {
        cancel('确认已取消');
        process.exit(0);
      }

      if (action === 'skip') continue;

      if (action === 'reject') {
        rejectPendingCandidate(c.memoryDir, c.id);
        rejected++;
        continue;
      }

      // confirm：需裁定 scope
      const scope = await confirmScope(options.scope as KnowledgeScope | undefined, c.id);
      if (scope === null) {
        cancel('确认已取消');
        process.exit(0);
      }
      const entry = confirmPendingCandidate(c.memoryDir, c.id, scope);
      if (entry) confirmed++;
    }

    note(
      [`确认入库：${confirmed} 条`, `拒绝删除：${rejected} 条`].join('\n'),
      '确认结果',
    );
    outro('Learn 完成');
  });

/** 交互式裁定 scope（个人/项目）。返回 null 表示取消。 */
async function confirmScope(
  preselect: KnowledgeScope | undefined,
  id: string,
): Promise<KnowledgeScope | null> {
  if (preselect) return preselect;
  const s = await select({
    message: `确认 "${id}" 的作用域归属：`,
    options: [
      { value: 'project', label: '项目（仅在当前项目生效）' },
      { value: 'personal', label: '个人（跨项目通用）' },
    ],
  });
  if (isCancel(s) || s === undefined) return null;
  return s as KnowledgeScope;
}
