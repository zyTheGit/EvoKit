/**
 * @internal — 确认闸门去重（ROADMAP v1.1 落地项，CONTEXT.md「确认闸门去重」）。
 *
 * 显式声明 / Git 历史候选在入库前，检查同 `type` 是否已存在归一化内容相近的 active 条目，
 * 提示用户三选（覆盖 / 仍新建 / 放弃）。只做**归一化文本匹配**（去空白/大小写/标点），
 * 不引入 embedding 语义去重（ADR 0003 明确不做 embedding 语义检测）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { writeKnowledgeEntry, removeIndexEntry } from './knowledge.js';
import { ensureArchitectureAnnotation } from './repository.js';
import type { KnowledgeRepository } from './repository.js';
import type { KnowledgeEntry, KnowledgeType } from './types.js';

/** 归一化知识文本：小写 + 去空白 + 去常见中英文标点（纯文本匹配，不做语义）。 */
export function normalizeKnowledgeText(text: string): string {
  return text.toLowerCase().replace(/[\s，。！？、,.!?；;：:'"“”‘’（）()[\]【】{}<>《》\-_]/g, '');
}

/** 相似条目命中记录。 */
export interface SimilarActive {
  entry: KnowledgeEntry;
  /** 命中的来源字段：context（摘要）/ body（正文）/ id */
  matchedOn: 'context' | 'body' | 'id';
}

/** 读取 active 条目正文（frontmatter 之后），无正文返回空串。 */
function readBodyText(filePath: string): string {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const first = raw.indexOf('---');
    const second = raw.indexOf('---', first + 3);
    if (first !== -1 && second !== -1) return raw.slice(second + 3).trim();
    return '';
  } catch {
    return '';
  }
}

/** 剥掉正文的 markdown 小节标题行（## 内容 / ## 影响范围 等）与空行前缀，用于归一化比对。 */
function stripMarkdownHeadings(body: string): string {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .join('\n');
}

/** 正文 → 归一化文本（标题不参与比对）。 */
function normOfBody(body: string): string {
  return normalizeKnowledgeText(stripMarkdownHeadings(body));
}

/**
 * 查找同 type 下归一化内容相近的 active 条目（ADR 0003 去重）。
 *
 * 匹配来源按优先级：context（摘要）→ body（正文）→ id（文件名）。
 * 只对非空文本归一化后**全等**才判为相近——确定性、零模型依赖。
 *
 * @param repo 目标知识根的单一数据访问层
 * @param type 待入库条目类型
 * @param content 待入库条目内容（显式声明文本 / Git 历史 pattern）
 * @returns 命中条目数组（可能多条），未命中返回空数组。
 */
export function findSimilarActive(
  repo: KnowledgeRepository,
  type: KnowledgeType,
  content: string,
): SimilarActive[] {
  const norm = normalizeKnowledgeText(content);
  if (!norm) return [];

  const hits: SimilarActive[] = [];
  for (const id of repo.listActive()) {
    const entry = repo.getActive(id);
    if (!entry || entry.type !== type) continue;

    if (entry.context && normalizeKnowledgeText(entry.context) === norm) {
      hits.push({ entry, matchedOn: 'context' });
      continue;
    }
    const body = readBodyText(path.join(repo.knowledgeDir, `${id}.md`));
    if (body && normOfBody(body) === norm) {
      hits.push({ entry, matchedOn: 'body' });
      continue;
    }
    if (normalizeKnowledgeText(id) === norm) {
      hits.push({ entry, matchedOn: 'id' });
    }
  }
  return hits;
}

/** 判断任一部分归一化后是否与目标全等。 */
function anyPartEquals(parts: Array<string | undefined>, norm: string): boolean {
  return parts.some((p) => p !== undefined && normalizeKnowledgeText(p) === norm);
}

/**
 * 检查 pending 或 active 中是否已存在归一化内容全等的条目（Git 历史候选重复去重，research §3.5.4）。
 *
 * 命中来源按优先级：正文（内容）→ context（摘要）→ id（文件名）。
 *
 * @returns 已存在返回 true（不应再写入重复候选）。
 */
export function hasContentAnywhere(repo: KnowledgeRepository, content: string): boolean {
  const norm = normalizeKnowledgeText(content);
  if (!norm) return true; // 空内容视为不可写，保守去重

  for (const id of repo.listActive()) {
    const entry = repo.getActive(id);
    const body = readBodyText(path.join(repo.knowledgeDir, `${id}.md`));
    if (anyPartEquals([body ? normOfBody(body) : undefined, entry?.context, id], norm)) return true;
  }
  for (const id of repo.listPending()) {
    const pending = repo.getPending(id);
    const body = readBodyText(path.join(repo.pendingDir, `${id}.md`));
    if (anyPartEquals([body ? normOfBody(body) : undefined, pending?.context, id], norm))
      return true;
  }
  return false;
}

/**
 * 覆盖已有 active 条目的正文（"合并/覆盖"动作，ADR 0003 去重三选）。
 *
 * 保留原 frontmatter（id/scope/type/source/confidence/created），刷新 `context` 与 `updated`，
 * 重写 `## 内容`（架构型沿用 `## 影响范围` 推理标注强制）。
 *
 * @returns 更新后的条目；id 不存在返回 null。
 */
export function overwriteActiveBody(
  repo: KnowledgeRepository,
  id: string,
  newContent: string,
  impact?: string,
): KnowledgeEntry | null {
  const entry = repo.getActive(id);
  if (!entry) return null;

  let body = `## 内容\n\n${newContent}`;
  if (entry.type === 'architecture') {
    body = ensureArchitectureAnnotation(
      entry.type,
      impact ? `${body}\n\n## 影响范围\n\n${impact}` : body,
    ).body;
  }
  const updated: KnowledgeEntry = {
    ...entry,
    context: newContent,
    updated: new Date().toISOString().slice(0, 10),
  };
  writeKnowledgeEntry(path.join(repo.knowledgeDir, `${id}.md`), updated, body);
  return updated;
}

// ─── 助手间冲突合并（ADR 0005，v1.2）─────────────────────────
//
// 事后健康诊断：归一化全等（**非语义近重复**）扫描同作用域内的 active+pending，
// 把"疑似重复对/簇"交给 doctor/boot 表面化、--fix 逐条人工三选（绝不自动择主）。
// 不实时、不引入 daemon/IPC/锁；守"人工背书唯一闸门"。

/** 重复簇中的一个成员（active 已入库或 pending 待确认）。 */
export interface DuplicateMember {
  id: string;
  status: 'active' | 'pending';
  type: KnowledgeType;
  context?: string;
}

/** 一组归一化全等重复条目（同 type、同签名）。members 中 active 在前、pending 在后。 */
export interface DuplicateGroup {
  type: KnowledgeType;
  /** 归一化签名（context→body→id 首非空者）；同 type 同签名即判重复 */
  signature: string;
  members: DuplicateMember[];
}

/**
 * 计算单条条目的归一化签名（ADR 0005 §C2）。
 * 优先级与 `findSimilarActive` 一致：context（摘要）→ body（正文，剥标题）→ id（文件名）。
 * 三者皆空返回空串（不入簇，避免误聚）。
 */
function signatureOf(content: string | undefined, bodyRaw: string | undefined, id: string): string {
  if (content) {
    const n = normalizeKnowledgeText(content);
    if (n) return n;
  }
  if (bodyRaw) {
    const n = normOfBody(bodyRaw);
    if (n) return n;
  }
  const n = normalizeKnowledgeText(id);
  return n; // id 兜底（空 id 极罕见）
}

/**
 * 扫描**单个作用域**（一个 repo = 一个根）内 active+pending 的归一化全等重复簇。
 *
 * - 检测宇宙：`pending↔pending` / `pending↔active` / `active↔active` 全覆盖。
 * - **不跨作用域**：个人级与项目级是独立 repo，天然隔离（ADR 0005 §作用域）。
 * - **非语义近重复**：只捕归一化全等；措辞异义漏报（"漏提优于误提"，ADR 0004 §3.5）。
 * - 成员排序：active 在前（便于"保留主条"默认指向已入库条目），pending 在后。
 *
 * @returns 重复簇数组（size ≥ 2）；无重复返回空数组。
 */
export function findExactDuplicates(repo: KnowledgeRepository): DuplicateGroup[] {
  const members: Array<{
    id: string;
    status: 'active' | 'pending';
    type: KnowledgeType;
    context?: string;
    body?: string;
  }> = [];

  for (const id of repo.listActive()) {
    const entry = repo.getActive(id);
    if (!entry) continue;
    const body = readBodyText(path.join(repo.knowledgeDir, `${id}.md`)) || undefined;
    members.push({ id, status: 'active', type: entry.type, context: entry.context, body });
  }
  for (const id of repo.listPending()) {
    const entry = repo.getPending(id);
    if (!entry) continue;
    const body = readBodyText(path.join(repo.pendingDir, `${id}.md`)) || undefined;
    members.push({ id, status: 'pending', type: entry.type, context: entry.context, body });
  }

  // 按 (type, signature) 分组
  const buckets = new Map<string, DuplicateMember[]>();
  for (const m of members) {
    const sig = signatureOf(m.context, m.body, m.id);
    if (!sig) continue; // 空签名不入簇
    const key = `${m.type} ${sig}`;
    const bucket = buckets.get(key);
    const member: DuplicateMember = {
      id: m.id,
      status: m.status,
      type: m.type,
      context: m.context,
    };
    if (bucket) bucket.push(member);
    else buckets.set(key, [member]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const type = key.split(' ')[0] as KnowledgeType;
    const signature = key.slice(key.indexOf(' ') + 1);
    // active 在前、pending 在后（稳定排序）
    list.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1));
    groups.push({ type, signature, members: list });
  }
  return groups;
}

/**
 * 人工三选中的"保留主条，删其余"（ADR 0005 合并执行契约）。
 *
 * - 保留 `keepId`；其余成员删除：pending → `rejectDraft`；active → 删文件 + `removeIndexEntry`。
 * - **绝不自动择主**：`keepId` 必由调用方（人工/--fix 交互）传入，本函数不做任何自动选择。
 * - 删除 active 同步移除索引行，避免孤儿（防回退不变量）。
 *
 * @returns 被删除的 id 列表；`keepId` 不在簇中则全删（调用方 bug，仍安全执行）。
 */
export function resolveDuplicateGroup(
  repo: KnowledgeRepository,
  group: DuplicateGroup,
  keepId: string,
): { removed: string[] } {
  const removed: string[] = [];
  for (const m of group.members) {
    if (m.id === keepId) continue;
    if (m.status === 'pending') {
      repo.rejectDraft(m.id);
    } else {
      const fp = path.join(repo.knowledgeDir, `${m.id}.md`);
      fs.rmSync(fp, { force: true });
      removeIndexEntry(repo.indexPath, m.id, 'evokit');
    }
    removed.push(m.id);
  }
  return { removed };
}
