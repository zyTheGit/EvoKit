// web API：知识卡端点的纯数据函数（overview / 列表 / 详情 / 三分区 / 检索）
// 纪律：不 import h3（框架收敛在 server.js/static.js）；对数据目录只读；检索绝不写 references

import {
  KNOWLEDGE_DIR,
  PENDING_DIR,
  ARCHIVE_DIR,
  REJECTED_DIR,
  KNOWLEDGE_INDEX_FILE,
  REFERENCES_FILE,
} from '../../paths.js';
import { listCards, readCardById } from '../../knowledge-cards.js';
import { readIndex } from '../../knowledge-index.js';
import { readReferences } from '../../references.js';
import { tokenScore } from '../../commands/recall.js';
import { hasGitRepo, logAll } from '../git.js';
import { httpError } from '../respond.js';
import { syncSummary } from './sync.js';

const SUMMARY_MAX = 120; // 列表摘要最大字符数（契约：正文压成单行 ≤120 字）

/** 分区 → 目录映射（id/标签语义见技术设计 §8） */
const ZONE_DIRS = { pending: PENDING_DIR, archive: ARCHIVE_DIR, rejected: REJECTED_DIR };

/** 分区中文标签（与 CLI 术语对齐） */
const ZONE_LABELS = { knowledge: '已入库', pending: '待审草稿', archive: '已归档', rejected: '已拒绝' };

/** 卡片 tags 归一为数组（标量/缺省容错，与 recall.js tagsOf 同规则） */
function tagsOf(front) {
  if (Array.isArray(front.tags)) return front.tags.map(String);
  if (front.tags !== undefined && front.tags !== '') return [String(front.tags)];
  return [];
}

/** 摘要：正文压成单行，截 ≤120 字符 */
function summaryOf(body) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > SUMMARY_MAX ? text.slice(0, SUMMARY_MAX - 1) + '…' : text;
}

/** 卡片列表输出形态（契约 §8.3） */
function cardOut(card) {
  return { id: card.id, file: card.file, front: card.front, summary: summaryOf(card.body) };
}

/** 已入库卡（知识根下 status=confirmed，排除 .pending/.archive/.rejected 隐藏区） */
function confirmedCards() {
  return listCards(KNOWLEDGE_DIR, { excludeHidden: true }).filter((c) => c.front.status === 'confirmed');
}

/** GET /api/overview：四区计数 + 索引行数 + 同步摘要 + 最近入库提交 */
export function overview() {
  const confirmed = confirmedCards();
  const pending = listCards(PENDING_DIR);
  const archive = listCards(ARCHIVE_DIR);
  const rejected = listCards(REJECTED_DIR);
  const { evokit } = readIndex(KNOWLEDGE_INDEX_FILE);
  const git = logAll(KNOWLEDGE_DIR);
  return {
    counts: {
      confirmed: confirmed.length,
      pending: pending.length,
      archive: archive.length,
      rejected: rejected.length,
    },
    indexEntries: evokit.length,
    syncSummary: syncSummary(),
    lastKnowledgeCommit: git.commits[0] ?? null,
  };
}

/** GET /api/pending|archive|rejected：对应分区全量卡 */
export function zoneCards(zone) {
  const dir = ZONE_DIRS[zone];
  if (!dir) throw httpError(404, `未知分区：${zone}`);
  return { cards: listCards(dir).map(cardOut) };
}

/** GET /api/cards?type&tag&sort：confirmed 列表；sort 仅 title|updated（默认 updated 降序） */
export function listCardsFiltered(query = {}) {
  let cards = confirmedCards();
  if (query.type) cards = cards.filter((c) => String(c.front.type ?? '') === String(query.type));
  if (query.tag) {
    const tag = String(query.tag);
    cards = cards.filter((c) => tagsOf(c.front).includes(tag));
  }
  const sort = String(query.sort ?? 'updated');
  if (sort === 'title') {
    cards.sort((a, b) => String(a.front.title ?? '').localeCompare(String(b.front.title ?? ''), 'zh'));
  } else {
    cards.sort((a, b) => String(b.front.updated ?? '').localeCompare(String(a.front.updated ?? '')));
  }
  return { cards: cards.map(cardOut) };
}

/** 跨四区按 id 找卡（file 为相对知识根路径，'/' 分隔） */
function findCardEverywhere(id) {
  const rootHit = readCardById(KNOWLEDGE_DIR, id);
  if (rootHit) return { card: { id, file: `${id}.md`, front: rootHit.front, body: rootHit.body }, zone: 'knowledge' };
  for (const zone of ['pending', 'archive', 'rejected']) {
    const found = listCards(ZONE_DIRS[zone]).find((c) => c.id === id);
    if (found) return { card: found, zone };
  }
  return null;
}

/** GET /api/cards/:id：详情（front 全字段 + 正文 + 召回次数 + git 可用性） */
export function cardDetail(id) {
  if (!id || /[\\/]/.test(id) || id.includes('..')) throw httpError(404, `卡片不存在：${id ?? ''}`);
  const hit = findCardEverywhere(id);
  if (!hit) throw httpError(404, `卡片不存在：${id}（已入库/待审/归档/拒绝四区均无此 id）`);
  const recallHits = readReferences(REFERENCES_FILE).filter((r) => r.cardId === id).length;
  return {
    id,
    file: hit.card.file,
    zone: ZONE_LABELS[hit.zone] ?? hit.zone,
    front: hit.card.front,
    body: hit.card.body,
    recallHits,
    hasGit: hasGitRepo(KNOWLEDGE_DIR),
  };
}

/**
 * GET /api/search?q=：评分检索，与 evokit recall 完全同口径（tags×3＞标题×2＞正文×1；
 * 同分排序 score→引用数→updated），唯一差异是【不写 references】（浏览不污染命中统计）。
 */
export function searchCards(rawQuery) {
  const query = String(rawQuery ?? '').trim();
  if (query === '') throw httpError(400, '缺少检索词 q，例如 /api/search?q=软链接');
  const tokens = query.split(/\s+/).filter(Boolean);
  const all = confirmedCards();
  const refCount = new Map();
  for (const rec of readReferences(REFERENCES_FILE)) {
    refCount.set(rec.cardId, (refCount.get(rec.cardId) || 0) + 1);
  }
  const hits = all
    .map((card) => ({ card, score: Math.max(0, ...tokens.map((tk) => tokenScore(card, tk))) }))
    .filter((h) => h.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || (refCount.get(b.card.id) || 0) - (refCount.get(a.card.id) || 0)
      || String(b.card.front.updated ?? '').localeCompare(String(a.card.front.updated ?? '')));
  return hits.map((h) => ({
    id: h.card.id,
    title: String(h.card.front.title ?? ''),
    type: String(h.card.front.type ?? ''),
    score: h.score,
    tags: tagsOf(h.card.front),
  }));
}
