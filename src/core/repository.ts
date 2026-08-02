/**
 * @internal — v1.0 知识条目单一数据访问层（KnowledgeRepository）。
 *
 * 统管 `evokit/` 下两个隔离区：
 * - `.pending/`  — 待确认草稿（PendingKnowledgeEntry，未背书，无 scope/confidence）
 * - `knowledge/` — 已背书条目（KnowledgeEntry，scope/confidence 齐备）
 *
 * 覆盖完整知识生命周期（#24 v1.0）：
 * - 建稿 / 确认 / 拒绝（对话提取静默标记 + 确认背书闸门，#25/#31）
 * - 过期检测状态转移 / 待复审名单（#26/#27/#34）
 * - 索引再生成（knowledge-index.md 由本层派生，供 AI 常驻加载）
 *
 * commands（learn/review/boot/migrate）与后续扩展统一走本层，
 * 消除各命令各扫各的重复扫描与索引解析（范畴 B 重构）。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  KnowledgeEntry,
  PendingKnowledgeEntry,
  KnowledgeScope,
  KnowledgeSource,
  KnowledgeType,
  KnowledgeStatus,
} from './types.js';
import {
  getEvokitDir,
  getKnowledgeDir,
  getKnowledgeIndexPath,
  listKnowledgeEntries,
  writeKnowledgeEntry,
  readKnowledgeEntry as readActiveEntry,
  appendToKnowledgeIndex,
  generateSlug,
} from './knowledge.js';
import { KnowledgeConfidence, transitionConfidence } from './knowledge.js';

/** pending 目录名 */
const PENDING_DIR = '.pending';

/** 前端 YAML frontmatter，草稿缺失 scope/confidence，须以 status 区分 */
const FRONTMATTER_DELIMITER = '---';

// ─── 目录定位 ───────────────────────────────────────────────

/** 返回 evokit/.pending/ 目录路径。 */
export function getPendingDir(memoryDir: string): string {
  return path.join(getEvokitDir(memoryDir), PENDING_DIR);
}

/** 生成唯一 slug 的草稿 id（跨 knowledge/ 与 .pending/ 去重，见 #31 D2）。 */
function uniqueDraftId(
  pendingDir: string,
  knowledgeDir: string,
  type: KnowledgeType,
  description: string,
): string {
  const slug = generateSlug(description);
  const base = `${type}-${slug}`;
  const used = new Set<string>([
    ...listKnowledgeEntries(knowledgeDir),
    ...listKnowledgeEntries(pendingDir),
  ]);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/** 序列化草稿 frontmatter（无 scope/confidence，带 status: pending）。 */
function serializePendingFrontmatter(entry: PendingKnowledgeEntry): string {
  const lines: string[] = [FRONTMATTER_DELIMITER];
  lines.push(`id: ${entry.id}`);
  lines.push(`status: pending`);
  lines.push(`type: ${entry.type}`);
  lines.push(`source: ${entry.source}`);
  lines.push(`created: ${entry.created}`);
  if (entry.context) lines.push(`context: ${entry.context}`);
  if (entry.tags && entry.tags.length > 0) lines.push(`tags: [${entry.tags.join(', ')}]`);
  lines.push(FRONTMATTER_DELIMITER);
  return lines.join('\n');
}

// ─── KnowledgeRepository ────────────────────────────────────

export interface KnowledgeRepositoryOptions {
  memoryDir: string;
}

/**
 * 知识条目单一数据访问层。
 *
 * 一个 repository 绑定一个 memory 目录（适配器级），在本目录的 evokit/ 下工作。
 * 个人级与项目级各用一个 repository 实例。
 */
export class KnowledgeRepository {
  readonly memoryDir: string;
  readonly evokitDir: string;
  readonly pendingDir: string;
  readonly knowledgeDir: string;
  readonly indexPath: string;

  constructor(options: KnowledgeRepositoryOptions) {
    this.memoryDir = options.memoryDir;
    this.evokitDir = getEvokitDir(this.memoryDir);
    this.pendingDir = getPendingDir(this.memoryDir);
    this.knowledgeDir = getKnowledgeDir(this.memoryDir);
    this.indexPath = getKnowledgeIndexPath(this.memoryDir);
  }

  // ── 目录就绪 ──────────────────────────────────────────

  /** 确保 evokit/ 目标目录存在（幂等，尽早失败否则后续写安全）。 */
  ensureDirs(): void {
    for (const dir of [this.evokitDir, this.pendingDir, this.knowledgeDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  // ── 草稿（.pending/，#31 静默引擎）─────────────────────

  /** 列出 pending 草稿 id。 */
  listPending(): string[] {
    return listKnowledgeEntries(this.pendingDir);
  }

  /** 读取单条 pending 草稿。 */
  getPending(id: string): PendingKnowledgeEntry | null {
    const fp = path.join(this.pendingDir, `${id}.md`);
    if (!fs.existsSync(fp)) return null;
    return parsePendingFile(fp);
  }

  /**
   * 静默写入一条草稿到 `.pending/`（#31）。
   * 不做 scope/confidence 强校验（草稿本就没有）；校验必填的 id/type/source。
   *
   * @param content 待确认条目内容（用于正文 `## 内容`）
   * @param scopeHint 空——识别时不猜作用域（由确认时人工裁定），本参数仅用于将来扩展
   */
  createDraft(input: {
    type: KnowledgeType;
    content: string;
    source?: KnowledgeSource;
    context?: string;
    tags?: string[];
  }): PendingKnowledgeEntry {
    this.ensureDirs();
    const source = input.source ?? 'conversation';
    const id = uniqueDraftId(
      this.pendingDir,
      this.knowledgeDir,
      input.type,
      input.content,
    );
    const entry: PendingKnowledgeEntry = {
      id,
      type: input.type,
      source,
      created: new Date().toISOString().slice(0, 10),
      context: input.context,
      tags: input.tags,
    };
    const body = `## 内容\n\n${input.content}`;
    const filePath = path.join(this.pendingDir, `${id}.md`);
    writePendingFile(filePath, entry, body);
    return entry;
  }

  /** 从 .pending/ 删除一条草稿（拒绝，或确认后移除）。 */
  rejectDraft(id: string): boolean {
    const fp = path.join(this.pendingDir, `${id}.md`);
    if (!fs.existsSync(fp)) return false;
    fs.rmSync(fp, { force: true });
    return true;
  }

  /**
   * 确认一条草稿 → 背书入库（#25/#31 D5）。
   * 补齐 scope（确认时人工裁定）+ confidence FRESH + updated，写 knowledge/，
   * 从 .pending/ 移除，并追加索引。返回生成的 KnowledgeEntry；草稿不存在返回 null。
   */
  confirmDraft(id: string, scope: KnowledgeScope): KnowledgeEntry | null {
    const pending = this.getPending(id);
    if (!pending) return null;

    const entry: KnowledgeEntry = {
      id: pending.id,
      scope,
      type: pending.type,
      source: pending.source,
      confidence: KnowledgeConfidence.FRESH,
      created: pending.created,
      updated: new Date().toISOString().slice(0, 10),
      context: pending.context,
      tags: pending.tags,
    };

    const filePath = path.join(this.knowledgeDir, `${entry.id}.md`);
    const body = this.readPendingBody(id) ?? `## 内容\n\n${pending.context ?? ''}`.trim();
    writeKnowledgeEntry(filePath, entry, body || undefined);
    appendToKnowledgeIndex(this.indexPath, entry.id, entry.context ?? entry.id);
    this.rejectDraft(id);
    return entry;
  }

  /** 读取草稿正文（确认时保留）。 */
  private readPendingBody(id: string): string | null {
    const fp = path.join(this.pendingDir, `${id}.md`);
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, 'utf-8');
    const second = raw.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);
    if (second === -1) return null;
    const body = raw.slice(second + FRONTMATTER_DELIMITER.length).trim();
    return body || null;
  }

  // ── 已入库条目（knowledge/）────────────────────────────

  /** 列出已入库条目 id。 */
  listActive(): string[] {
    return listKnowledgeEntries(this.knowledgeDir);
  }

  /** 读取单条已入库条目。 */
  getActive(id: string): KnowledgeEntry | null {
    const fp = path.join(this.knowledgeDir, `${id}.md`);
    return readActiveEntry(fp);
  }

  /** 列出全部条目（draft + active）id，用于跨区判重。 */
  listAll(): string[] {
    return [...new Set([...this.listPending(), ...this.listActive()])];
  }

  // ── 过期检测（#26/#27/#34）────────────────────────────

  /**
   * 待复审名单 = 所有 confidence ≤ 0.5（STALE/RETIRED）的已入库条目。
   * 三触发点共享此名单定义（#34），唯一事实源 = 文件实际 confidence。
   */
  collectStale(): KnowledgeEntry[] {
    return this.listActive()
      .map((id) => this.getActive(id))
      .filter((e): e is KnowledgeEntry => e !== null && e.confidence <= KnowledgeConfidence.STALE)
      .sort((a, b) => a.confidence - b.confidence);
  }

  /**
   * 对条目应用过期检测：FRESH→STALE 落盘 + 刷新 updated。
   * 触发器：对话中发现失效 / /evokit-learn 确认时顺带（#34 触发点 1/2）。
   * 仅允许 expire（降档至待复审），RETIRED/删除留待 /evokit-review 人工裁决。
   *
   * @returns 转移后的条目；id 不存在返回 null；已是 STALE 或更低不做重复降档（幂等）。
   */
  expire(id: string): KnowledgeEntry | null {
    const entry = this.getActive(id);
    if (!entry) return null;
    const next = transitionConfidence(entry.confidence, 'expire');
    if (next === entry.confidence) return entry; // 幂等：非法/重复转移不落盘
    const updated: KnowledgeEntry = {
      ...entry,
      confidence: next,
      updated: new Date().toISOString().slice(0, 10),
    };
    const fp = path.join(this.knowledgeDir, `${id}.md`);
    const body = readActiveBody(fp);
    writeKnowledgeEntry(fp, updated, body || undefined);
    return updated;
  }
}

// ─── 文件辅助（草稿读写）────────────────────────────────

function writePendingFile(
  filePath: string,
  entry: PendingKnowledgeEntry,
  body: string,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const parts = [serializePendingFrontmatter(entry)];
  if (body && body.trim()) parts.push('', body.trim());
  fs.writeFileSync(filePath, parts.join('\n') + '\n', 'utf-8');
}

function parsePendingFile(filePath: string): PendingKnowledgeEntry | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const front = raw.slice(
    0,
    raw.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length),
  );
  const entry: Record<string, unknown> = {};
  for (const line of front.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    entry[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  if (!entry.id || !entry.type || !entry.source || !entry.created) return null;
  return {
    id: String(entry.id),
    type: entry.type as KnowledgeType,
    source: entry.source as KnowledgeSource,
    created: String(entry.created),
    context: entry.context ? String(entry.context) : undefined,
    tags: Array.isArray(entry.tags) ? (entry.tags as string[]) : undefined,
  };
}

function readActiveBody(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const second = raw.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);
  if (second === -1) return null;
  const body = raw.slice(second + FRONTMATTER_DELIMITER.length).trim();
  return body || null;
}

// 重新导出类型以方便消费方引用
export type { KnowledgeStatus };
