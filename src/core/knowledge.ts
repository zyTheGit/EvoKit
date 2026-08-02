/**
 * @internal — v1.0 知识条目 CRUD 操作。
 *
 * 处理知识条目文件的 YAML frontmatter 解析/写入、
 * knowledge-index.md 的读写、以及归档操作。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeEntry, KnowledgeType, KnowledgeScope } from './types.js';

// ─── YAML frontmatter 解析/写入 ─────────────────────────────

const FRONTMATTER_DELIMITER = '---';

/**
 * 解析知识条目文件的 YAML frontmatter。
 * 仅支持简单的 key: value 格式，不依赖第三方 YAML 库。
 */
export function parseKnowledgeFrontmatter(content: string): KnowledgeEntry | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) return null;

  const endIndex = trimmed.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);
  if (endIndex === -1) return null;

  const yamlBlock = trimmed.slice(FRONTMATTER_DELIMITER.length, endIndex).trim();
  const entry: Record<string, unknown> = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    entry[key] = parseYamlValue(value);
  }

  // 验证必填字段
  if (
    !entry.id ||
    !entry.scope ||
    !entry.type ||
    !entry.source ||
    entry.confidence === undefined ||
    !entry.created
  ) {
    return null;
  }

  // confidence 必须落在离散三档合法取值（ADR 0002 状态机）
  const confidence = entry.confidence as number;
  if (!isKnownConfidence(confidence)) {
    return null;
  }

  return entry as unknown as KnowledgeEntry;
}

/** 解析简单 YAML 值（字符串、数字、数组） */
function parseYamlValue(value: string): unknown {
  // 数组格式：[a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((s) => s.trim());
  }
  // 数字
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }
  // 布尔
  if (value === 'true') return true;
  if (value === 'false') return false;
  // 字符串（去除引号）
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** 将 KnowledgeEntry 序列化为 YAML frontmatter 字符串 */
function serializeFrontmatter(entry: KnowledgeEntry): string {
  const lines: string[] = [FRONTMATTER_DELIMITER];
  lines.push(`id: ${entry.id}`);
  lines.push(`scope: ${entry.scope}`);
  lines.push(`type: ${entry.type}`);
  lines.push(`source: ${entry.source}`);
  lines.push(`confidence: ${entry.confidence}`);
  lines.push(`created: ${entry.created}`);
  if (entry.updated) lines.push(`updated: ${entry.updated}`);
  if (entry.context) lines.push(`context: ${entry.context}`);
  if (entry.tags && entry.tags.length > 0) lines.push(`tags: [${entry.tags.join(', ')}]`);
  lines.push(FRONTMATTER_DELIMITER);
  return lines.join('\n');
}

// ─── 知识条目文件操作 ───────────────────────────────────────

/**
 * 读取知识条目文件，解析 frontmatter。
 * 文件不存在时返回 null。
 */
export function readKnowledgeEntry(filePath: string): KnowledgeEntry | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseKnowledgeFrontmatter(content);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * 写入知识条目文件（frontmatter + 正文）。
 * 自动创建目录。
 */
export function writeKnowledgeEntry(filePath: string, entry: KnowledgeEntry, body?: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const parts = [serializeFrontmatter(entry)];
  if (body && body.trim()) {
    parts.push('', body.trim());
  }
  fs.writeFileSync(filePath, parts.join('\n') + '\n', 'utf-8');
}

/**
 * 列出 knowledge/ 目录下所有知识条目。
 * 返回条目 id 列表（不含 .md 后缀）。
 */
export function listKnowledgeEntries(knowledgeDir: string): string[] {
  if (!fs.existsSync(knowledgeDir)) return [];
  const files = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'));
  return files.map((f) => f.slice(0, -3));
}

// ─── knowledge-index.md 操作 ─────────────────────────────────

const INDEX_HEADER = '## 个人知识';
const CLAUDE_HEADER = '## 项目知识';

/**
 * 读取 knowledge-index.md，返回解析后的结构。
 * 返回 { evokit: 条目行数组, claude: 条目行数组 }。
 */
export function readKnowledgeIndex(indexPath: string): {
  evokit: string[];
  claude: string[];
} {
  try {
    const content = fs.readFileSync(indexPath, 'utf-8');
    const lines = content.split('\n');
    const evokit: string[] = [];
    const claude: string[] = [];
    let section: 'evokit' | 'claude' | null = null;

    for (const line of lines) {
      if (line.trim() === INDEX_HEADER) {
        section = 'evokit';
        continue;
      }
      if (line.trim() === CLAUDE_HEADER) {
        section = 'claude';
        continue;
      }
      if (line.startsWith('## ')) {
        section = null;
        continue;
      }
      if (section === 'evokit' && line.trim().startsWith('- [')) {
        evokit.push(line.trim());
      } else if (section === 'claude' && line.trim().startsWith('- [')) {
        claude.push(line.trim());
      }
    }

    return { evokit, claude };
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { evokit: [], claude: [] };
    }
    throw err;
  }
}

/**
 * 写入 knowledge-index.md。
 * 自动创建目录。
 */
export function writeKnowledgeIndex(
  indexPath: string,
  evokitEntries: string[],
  claudeEntries: string[],
): void {
  const dir = path.dirname(indexPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [];
  lines.push(INDEX_HEADER);
  lines.push('');
  for (const entry of evokitEntries) {
    lines.push(entry);
  }
  lines.push('');
  lines.push(CLAUDE_HEADER);
  lines.push('');
  for (const entry of claudeEntries) {
    lines.push(entry);
  }
  lines.push('');

  fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
}

/**
 * 向 knowledge-index.md 追加 EvoKit 知识条目。
 * 如果文件不存在则创建。
 */
export function appendToKnowledgeIndex(indexPath: string, entryId: string, summary: string): void {
  const { evokit, claude } = readKnowledgeIndex(indexPath);
  // 检查是否已存在
  const existingIds = new Set(
    evokit.map((l) => {
      const match = l.match(/^- \[([^\]]+)\]/);
      return match ? match[1] : '';
    }),
  );
  if (existingIds.has(entryId)) return;

  evokit.push(`- [${entryId}] ${summary}`);
  writeKnowledgeIndex(indexPath, evokit, claude);
}

// ─── slug 生成 ───────────────────────────────────────────────

/**
 * 从描述文本生成 kebab-case slug。
 * 支持中英文混合：英文转小写+连字符，中文保留拼音首字母。
 * 简化实现：提取英文单词和数字，中文取前几个字符的 hex 编码。
 */
export function generateSlug(description: string): string {
  // 提取英文单词和数字
  const englishParts = description
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());

  if (englishParts.length >= 2) {
    return englishParts.slice(0, 4).join('-');
  }

  // 英文不足时，尝试提取中文关键词
  const chineseChars = description.match(/[一-鿿]/g);
  if (chineseChars && chineseChars.length > 0) {
    const prefix = englishParts.length > 0 ? englishParts.join('-') + '-' : '';
    // 取前 3 个中文字符的 Unicode 码点简化表示
    const hex = chineseChars
      .slice(0, 3)
      .map((c) => c.charCodeAt(0).toString(16))
      .join('');
    return prefix + 'zh' + hex;
  }

  // 纯数字或极短
  if (englishParts.length === 1) return englishParts[0];

  // 兜底：用 hash
  return 'rule-' + Buffer.from(description).toString('hex').slice(0, 8);
}

/**
 * 生成唯一的知识条目 ID（type-slug 格式）。
 * 如果 knowledge/ 目录中已存在同名文件，追加数字后缀。
 */
export function generateUniqueKnowledgeId(
  knowledgeDir: string,
  type: KnowledgeType,
  slug: string,
): string {
  const existing = new Set(listKnowledgeEntries(knowledgeDir));
  let id = `${type}-${slug}`;
  if (!existing.has(id)) return id;

  let suffix = 2;
  while (existing.has(`${type}-${slug}-${suffix}`)) {
    suffix++;
  }
  return `${type}-${slug}-${suffix}`;
}

// ─── 归档操作 ────────────────────────────────────────────────

/**
 * 归档旧文件到 evokit/archive/v0/。
 * 自动创建目录。如果目标已存在则跳过。
 */
export function archiveFileToV0(filePath: string, archiveDir: string): boolean {
  if (!fs.existsSync(filePath)) return false;

  const fileName = path.basename(filePath);
  const destPath = path.join(archiveDir, fileName);

  if (fs.existsSync(destPath)) return false;

  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  fs.renameSync(filePath, destPath);
  return true;
}

/**
 * 获取 evokit/ 目录路径（基于 memory 目录）。
 */
export function getEvokitDir(memoryDir: string): string {
  return path.join(memoryDir, 'evokit');
}

/**
 * 获取 knowledge/ 目录路径。
 */
export function getKnowledgeDir(memoryDir: string): string {
  return path.join(getEvokitDir(memoryDir), 'knowledge');
}

/**
 * 获取 knowledge-index.md 路径。
 */
export function getKnowledgeIndexPath(memoryDir: string): string {
  return path.join(getEvokitDir(memoryDir), 'knowledge-index.md');
}

/**
 * 获取 archive/v0/ 目录路径。
 */
export function getArchiveV0Dir(memoryDir: string): string {
  return path.join(getEvokitDir(memoryDir), 'archive', 'v0');
}

// ─── learned-rules.md 迁移解析 ───────────────────────────────

/** 模板空文本标记 */
const EMPTY_TEMPLATE_MARKER = 'No rules have been promoted yet';

/**
 * 检测 learned-rules.md 是否为模板空文本。
 */
export function isEmptyLearnedRules(content: string): boolean {
  return content.includes(EMPTY_TEMPLATE_MARKER) || content.trim().length === 0;
}

/**
 * 从 learned-rules.md 内容解析规则条目（扩展版，支持迁移）。
 *
 * 处理三种格式变体：
 * 1. 模板空文本 → 返回空数组
 * 2. `- **描述** — 补充说明` + `<!-- verify: -->` + `<!-- promoted: 日期 -->`
 * 3. `- **描述**`（无补充说明，代码生成格式）
 *
 * deprecated 标记的条目包含在结果中但标记 deprecated=true。
 */
export function parseLearnedRulesForMigration(content: string): Array<{
  description: string;
  explanation?: string;
  verify?: string;
  promoted?: string;
  deprecated: boolean;
}> {
  if (isEmptyLearnedRules(content)) return [];

  const lines = content.split('\n');
  const rules: Array<{
    description: string;
    explanation?: string;
    verify?: string;
    promoted?: string;
    deprecated: boolean;
  }> = [];

  let current: Partial<{
    description: string;
    explanation: string;
    verify: string;
    promoted: string;
    deprecated: boolean;
  }> | null = null;

  for (const line of lines) {
    // 匹配规则行：- **描述** (deprecated) 或 - **描述** — 补充说明 (deprecated)
    const ruleMatch = line.match(
      /^- \*\*(.+?)\*\*(?:\s*\(deprecated\))?(?:\s*—\s*(.+?))?(?:\s*\(deprecated\))?\s*$/,
    );
    if (ruleMatch) {
      // 保存上一条
      if (current?.description) {
        rules.push(current as (typeof rules)[number]);
      }
      current = {
        description: ruleMatch[1],
        deprecated: line.includes('(deprecated)'),
      };
      // 捕获补充说明
      if (ruleMatch[2]) {
        current.explanation = ruleMatch[2].replace(/\s*\(deprecated\)\s*$/, '').trim();
      }
      continue;
    }

    if (current) {
      const verifyMatch = line.match(/<!--\s*verify:\s*(.+?)\s*-->/);
      if (verifyMatch) {
        current.verify = verifyMatch[1].trim();
      }
      const promotedMatch = line.match(/<!--\s*promoted:\s*(.+?)\s*-->/);
      if (promotedMatch) {
        // 提取日期部分（promoted 值可能包含 "日期 from corrections..." 等后缀）
        const promotedValue = promotedMatch[1].trim();
        const dateMatch = promotedValue.match(/^(\d{4}-\d{2}-\d{2})/);
        current.promoted = dateMatch ? dateMatch[1] : promotedValue;
      }
    }
  }

  // 保存最后一条
  if (current?.description) {
    rules.push(current as (typeof rules)[number]);
  }

  return rules;
}

/**
 * 将解析后的 learned-rules.md 条目转换为 MigratedRule。
 *
 * 转换规则（对齐领域模型 + ADR 0002）：
 * - type=convention, source=explicit（当场背书，migrate 由用户确认交互背书）
 * - confidence=FRESH(0.9)，接入三档状态机
 * - verify 丢弃
 * - promoted 提取日期作为 created
 * - deprecated 条目标记为跳过
 */
export function convertRuleToMigrated(
  parsed: {
    description: string;
    explanation?: string;
    verify?: string;
    promoted?: string;
    deprecated: boolean;
  },
  scope: KnowledgeScope,
  knowledgeDir: string,
): {
  originalDescription: string;
  entry: KnowledgeEntry;
  note?: string;
  deprecated: boolean;
} {
  const slug = generateSlug(parsed.description);
  const id = generateUniqueKnowledgeId(knowledgeDir, 'convention', slug);
  const created = parsed.promoted || new Date().toISOString().slice(0, 10);

  const entry: KnowledgeEntry = {
    id,
    scope,
    type: 'convention',
    source: 'explicit', // 当场背书：migrate 用户确认即入库，不经过 .pending/ 批量确认
    confidence: KnowledgeConfidence.FRESH,
    created,
    context: parsed.explanation || undefined,
  };

  const notes: string[] = [];
  if (parsed.verify) {
    notes.push('verify 字段已丢弃（v1.0 不保留）');
  }
  if (!parsed.promoted) {
    notes.push('无 promoted 日期，使用当前日期');
  }

  return {
    originalDescription: parsed.description,
    entry,
    note: notes.length > 0 ? notes.join('；') : undefined,
    deprecated: parsed.deprecated,
  };
}

// ─── confidence 三档离散状态机 (ADR 0002) ───────────────────

/**
 * confidence 三档离散值（非透明数值，是维护/新鲜度信号）。
 *
 * - FRESH  0.9 — 已确认且有效（人工背书后初始值，无条件成立的高值前提）
 * - STALE  0.5 — 待复审（过期检测命中后标记，进 /evokit-review 名单）
 * - RETIRED 0.1 — 疑失效（复审后仍存疑，交用户定留/删）
 *
 * 时间流逝不自动衰减 confidence；降档只来自过期检测的二分判断。
 */
export const KnowledgeConfidence = {
  FRESH: 0.9,
  STALE: 0.5,
  RETIRED: 0.1,
} as const;

/** confidence 三档取值类型 */
export type KnowledgeConfidenceValue =
  (typeof KnowledgeConfidence)[keyof typeof KnowledgeConfidence];

/**
 * confidence 转移事件（触发是二分判断，落到是指定档位）。
 *
 * | 事件              | 触发点                          | 前→后        |
 * |-------------------|---------------------------------|--------------|
 * | `expire`          | 过期检测命中                    | FRESH→STALE  |
 * | `review-doubtful` | 复审后仍存疑                    | STALE→RETIRED|
 * | `review-confirm`  | 复审确认仍有效                  | STALE→FRESH  |
 */
export type ConfidenceEvent = 'expire' | 'review-doubtful' | 'review-confirm';

/**
 * 计算 confidence 转移后的下一档。
 *
 * 遵循 ADR 0002：降档只来自过期检测（expire）；复审确认可回升 FRESH；
 * 复审后仍存疑降至 RETIRED，交用户定留/删（删除即不进状态机）。
 * 非法转移（如直接 RETIRED→STALE）返回当前值不变。
 */
export function transitionConfidence(
  current: KnowledgeConfidenceValue,
  event: ConfidenceEvent,
): KnowledgeConfidenceValue {
  switch (current) {
    case KnowledgeConfidence.FRESH:
      return event === 'expire' ? KnowledgeConfidence.STALE : current;
    case KnowledgeConfidence.STALE:
      if (event === 'review-confirm') return KnowledgeConfidence.FRESH;
      if (event === 'review-doubtful') return KnowledgeConfidence.RETIRED;
      return current;
    case KnowledgeConfidence.RETIRED:
      if (event === 'review-confirm') return KnowledgeConfidence.FRESH;
      return current;
    default:
      return current;
  }
}

/**
 * 判断 confidence 是否已列入复审名单（≤ STALE）。
 * 用于 /evokit-review 全量复审阈值判断。
 */
export function needsReview(confidence: number): boolean {
  return confidence <= KnowledgeConfidence.STALE;
}

/** 判断 confidence 是否落在三档合法取值内 */
export function isKnownConfidence(confidence: number): boolean {
  return (
    confidence === KnowledgeConfidence.FRESH ||
    confidence === KnowledgeConfidence.STALE ||
    confidence === KnowledgeConfidence.RETIRED
  );
}
