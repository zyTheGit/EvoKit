// 索引读写器（ADR 0009 §2/§4/§5，计划 §2.3.3）
// `## EvoKit 知识` 是唯一可重建桶；其余任何 `##` 段为透传段：读侧逐字收集、写侧逐字写回，永不重建、永不删除。
// 旧 header 永久别名：`## 个人知识` → EvoKit 桶、`## 项目知识` → 透传桶（读侧映射，写侧只出新 header）。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listCards } from './knowledge-cards.js';
import { lastRefMap } from './references.js';

// 桶 header 与旧别名（读侧映射用）
const EVOKIT_HEADER = '## EvoKit 知识';
const LEGACY_PERSONAL = '## 个人知识'; // → EvoKit 桶
const LEGACY_PROJECT = '## 项目知识'; // → 透传桶
const INDEX_FILE_NAME = 'knowledge-index.md'; // 与 paths.js KNOWLEDGE_INDEX_FILE 一致
const REFERENCES_FILE_NAME = 'references.jsonl'; // 与 paths.js REFERENCES_FILE 一致

// 索引行提取：全链路唯一规则（ADR 0009 §4，对齐 ADR 0008）
const ID_LINE_RE = /^- \[([^\]]+)\]/;

// 类型 → 摘要前缀标记（不进中括号）
const TYPE_MARK = { pitfall: '⚠ ', pattern: '🏛 ', workflow: '🔧 ' };

/**
 * 读索引：EvoKit 桶行提取 {id, text}；其余 `##` 段逐字收进 unknown（含 header 行与空行）。
 * 文件不存在 / 无 `##` 段 → 空桶空透传。
 * @param {string} file 索引文件路径
 * @returns {{ evokit: Array<{ id: string, text: string }>, unknown: Array<{ header: string, text: string }> }}
 */
export function readIndex(file) {
  const evokit = [];
  const unknown = [];
  if (!existsSync(file)) return { evokit, unknown };
  const text = readFileSync(file, 'utf-8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  let bucket = null; // 'evokit' | 'unknown'
  let curUnknown = null; // { header, lines: string[] }
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const header = `## ${m[1]}`;
      if (header === EVOKIT_HEADER || header === LEGACY_PERSONAL) {
        bucket = 'evokit';
        curUnknown = null;
      } else {
        // 其余任何 ## 段（含旧 `## 项目知识`）为透传段，header 行原样保留
        bucket = 'unknown';
        curUnknown = { header, lines: [] };
        unknown.push(curUnknown);
      }
      continue;
    }
    if (bucket === 'evokit') {
      const idM = line.match(ID_LINE_RE);
      if (idM) evokit.push({ id: idM[1], text: line });
      // 可重建桶里的非条目行（空行等）不透传
    } else if (bucket === 'unknown' && curUnknown) {
      curUnknown.lines.push(line); // 空行也逐字保留
    }
    // 第一个 ## 之前的行（文件头标题等）不在透传契约内
  }
  return {
    evokit,
    unknown: unknown.map(({ header, lines: ls }) => ({ header, text: ls.join('\n') })),
  };
}

/**
 * 写索引：重写 EvoKit 桶，unknown 段逐字写回（LF、无 BOM）。
 * @param {string} file 索引文件路径
 * @param {string[]} evokitLines EvoKit 桶行（`- [id] 摘要` 形态，通常来自 rebuildIndex().lines）
 * @param {Array<{ header: string, text: string }>} unknownSections 透传段（header 含 `## ` 前缀；text 为段内全部行）
 */
export function writeIndex(file, evokitLines, unknownSections = []) {
  const out = ['# EvoKit 知识索引', '', EVOKIT_HEADER];
  for (const line of evokitLines) out.push(line);
  for (const sec of unknownSections) {
    if (out.length > 0 && out[out.length - 1] !== '') out.push(''); // 段间分隔：前段末行非空时补一个空行
    out.push(sec.header);
    const text = String(sec.text ?? '');
    if (text !== '') for (const l of text.split('\n')) out.push(l); // 段内行逐字写回（含空行）
  }
  writeFileSync(file, out.join('\n') + '\n', 'utf-8');
}

/**
 * 从一行索引行提取卡 id：`- [id] 摘要`；不匹配返回 null。
 * @param {string} line
 * @returns {string | null}
 */
export function extractIdFromLine(line) {
  const m = String(line).match(ID_LINE_RE);
  return m ? m[1] : null;
}

/**
 * 由卡片生成索引行：`- [id] <标记><title> #tags`。
 * 标记：pitfall→⚠、pattern→🏛、workflow→🔧、其余无。
 * @param {{ id: string, front: Record<string, unknown> }} card
 * @returns {string}
 */
export function buildIndexLine(card) {
  const { id, front } = card;
  const mark = TYPE_MARK[String(front.type)] ?? '';
  const title = String(front.title ?? '');
  const tags = Array.isArray(front.tags)
    ? front.tags
    : (front.tags !== undefined && front.tags !== '' ? [front.tags] : []);
  const tagStr = tags.length > 0 ? ' ' + tags.map((t) => `#${String(t)}`).join(' ') : '';
  return `- [${id}] ${mark}${title}${tagStr}`;
}

/**
 * 重建 EvoKit 桶行：confirmed 才进索引；溢出按（最近引用 desc、confidence desc、updated desc）挤出。
 * 无引用数据时「最近引用」退化为 updated。被挤出卡保留在库文件中（本函数只产出行，不删文件）。
 * @param {string} knowledgeDir 知识根目录
 * @param {Array<{ id: string, front: Record<string, unknown>, body: string }>} cards listCards 产物
 * @param {number} [budget=60] L1 索引常驻行数硬上限
 * @returns {{ lines: string[], dropped: string[] }}
 */
export function rebuildIndex(knowledgeDir, cards, budget = 60) {
  const refs = lastRefMap(join(knowledgeDir, REFERENCES_FILE_NAME));
  const scored = cards
    .filter((c) => c.front.status === 'confirmed')
    .map((c) => ({
      id: c.id,
      front: c.front,
      refTs: refs.get(c.id) || String(c.front.updated ?? ''),
      conf: Number(c.front.confidence) || 0,
      updated: String(c.front.updated ?? ''),
    }));
  scored.sort((a, b) =>
    b.refTs.localeCompare(a.refTs) || b.conf - a.conf || b.updated.localeCompare(a.updated));
  return {
    lines: scored.slice(0, Math.max(0, budget)).map(buildIndexLine),
    dropped: scored.slice(Math.max(0, budget)).map((c) => c.id),
  };
}

/**
 * 悬空/孤儿检测（供 review 与体检输出）：
 *   dangling = 索引行 id 无对应卡片文件；orphan = 正式卡文件无索引行。
 * 正式卡 = 知识根下递归 .md（排除 `.` 开头隐藏目录，.pending 草稿本就不进索引）。
 * @param {string} knowledgeDir 知识根目录
 * @returns {{ dangling: string[], orphan: string[] }}
 */
export function diffIndex(knowledgeDir) {
  const { evokit } = readIndex(join(knowledgeDir, INDEX_FILE_NAME));
  const indexIds = new Set(evokit.map((e) => e.id));
  const cards = listCards(knowledgeDir, { excludeHidden: true });
  const fileIds = new Set(cards.map((c) => c.id));
  return {
    dangling: [...indexIds].filter((id) => !fileIds.has(id)),
    orphan: cards.map((c) => c.id).filter((id) => !indexIds.has(id)),
  };
}
