// recall 命令（T-M3.3）：本地评分检索 confirmed 卡 + 命中计数（references.jsonl）
// 评分：token 命中 tags（全等，不分大小写）×3 ＞ 标题子串 ×2 ＞ 正文子串 ×1；多 token 取最大得分
// 同分排序：score desc → 引用次数 desc → updated desc
// 纪律：无命中友好提示且 exit 0；--json 的 stdout 有且只有一个合法 JSON 数组（计划红线 #4 同款）

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWLEDGE_DIR, REFERENCES_FILE } from '../paths.js';
import { listCards } from '../knowledge-cards.js';
import { appendReference, readReferences } from '../references.js';
import { TYPE_MARK } from '../knowledge-index.js';

const DEFAULT_LIMIT = 10; // --limit 缺省值
const SUMMARY_MAX = 100;  // 摘要行最大字符数

/**
 * 解析 --limit 值；缺失/非法回落默认值（解析容错，不中断检索）。
 * @param {string[]} args
 * @returns {number}
 */
function parseLimit(args) {
  const idx = args.indexOf('--limit');
  if (idx === -1) return DEFAULT_LIMIT;
  const raw = args[idx + 1];
  const n = Number(raw);
  if (raw === undefined || !Number.isInteger(n) || n <= 0) {
    console.error(`⚠ --limit 值不合法：「${raw ?? ''}」，使用默认 ${DEFAULT_LIMIT}`);
    return DEFAULT_LIMIT;
  }
  return n;
}

/** 卡片 tags 归一为数组（标量/缺省容错，与 buildIndexLine 同规则） */
function tagsOf(front) {
  if (Array.isArray(front.tags)) return front.tags.map(String);
  if (front.tags !== undefined && front.tags !== '') return [String(front.tags)];
  return [];
}

/**
 * 单 token 对一张卡的命中得分：tags 全等（不分大小写）×3 ＞ 标题子串 ×2 ＞ 正文子串 ×1。
 * @param {{ front: Record<string, unknown>, body: string }} card
 * @param {string} token
 * @returns {number}
 */
function tokenScore(card, token) {
  const t = token.toLowerCase();
  if (tagsOf(card.front).some((tag) => tag.toLowerCase() === t)) return 3;
  if (String(card.front.title ?? '').toLowerCase().includes(t)) return 2;
  if (String(card.body ?? '').toLowerCase().includes(t)) return 1;
  return 0;
}

/** 摘要：正文压成单行，截 ≤100 字符 */
function summary(body) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > SUMMARY_MAX ? text.slice(0, SUMMARY_MAX - 1) + '…' : text;
}

/**
 * `evokit recall "<关键词>"` 入口
 * @param {string[]} args 参数（不含 'recall' 本身）：<query...> / --limit n / --json
 */
export function recallCommand(args) {
  try {
    const asJson = args.includes('--json');
    const limit = parseLimit(args);
    // 位置参数 query：剔除 flag 及其取值后余下的全部 token（按空白分词）
    const queryParts = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json') continue;
      if (args[i] === '--limit') { i += 1; continue; }
      queryParts.push(args[i]);
    }
    const query = queryParts.join(' ').trim();
    if (query === '') {
      const usage = '用法：evokit recall "<关键词>" [--limit n] [--json]\n'
        + '  evokit recall fnm            检索知识卡（tags×3 ＞ 标题×2 ＞ 正文×1）\n'
        + '  evokit recall fnm --limit 5  只显示前 5 条\n'
        + '  evokit recall fnm --json     输出单个 JSON 数组（供程序消费）';
      if (asJson) console.error(usage);
      else console.log(usage);
      process.exitCode = 1;
      return;
    }
    const tokens = query.split(/\s+/).filter(Boolean);
    const all = listCards(KNOWLEDGE_DIR, { excludeHidden: true })
      .filter((c) => c.front.status === 'confirmed'); // draft/retired 不参与
    // 引用次数（references.jsonl 全类型计数），同分排序用
    const refCount = new Map();
    for (const rec of readReferences(REFERENCES_FILE)) {
      refCount.set(rec.cardId, (refCount.get(rec.cardId) || 0) + 1);
    }
    const hits = all
      .map((c) => ({ card: c, score: Math.max(0, ...tokens.map((tk) => tokenScore(c, tk))) }))
      .filter((h) => h.score > 0)
      .sort((a, b) =>
        b.score - a.score
        || (refCount.get(b.card.id) || 0) - (refCount.get(a.card.id) || 0)
        || String(b.card.front.updated ?? '').localeCompare(String(a.card.front.updated ?? '')));
    const top = hits.slice(0, limit);
    // 每次命中写 references（FR-11）：展示出的每条命中记一条 recall 事件
    for (const h of top) {
      try {
        appendReference(REFERENCES_FILE, { type: 'recall', cardId: h.card.id });
      } catch (e) {
        console.error(`⚠ 引用计数写入失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (asJson) {
      const arr = top.map((h) => ({
        id: h.card.id,
        title: String(h.card.front.title ?? ''),
        type: String(h.card.front.type ?? ''),
        score: h.score,
        path: join(KNOWLEDGE_DIR, h.card.file),
        tags: tagsOf(h.card.front),
      }));
      console.log(JSON.stringify(arr)); // stdout 有且只有这一个 JSON
      if (hits.length === 0) {
        console.error(`ℹ 未命中任何 confirmed 知识卡（检索范围：${KNOWLEDGE_DIR}）`);
      }
      return; // exit 0
    }
    if (hits.length === 0) {
      console.log(`ℹ 未命中任何 confirmed 知识卡（关键词：${query}）。`);
      console.log(`  检索范围：${KNOWLEDGE_DIR}（draft/retired 不参与）`);
      if (!existsSync(KNOWLEDGE_DIR)) console.log('  知识根尚未初始化，先运行 `evokit knowledge init`。');
      return; // 无命中也 exit 0
    }
    console.log(`🔍 recall "${query}" — 命中 ${hits.length} 张，显示前 ${top.length} 张：\n`);
    for (const h of top) {
      const mark = TYPE_MARK[String(h.card.front.type)] ?? '';
      const title = String(h.card.front.title ?? '');
      const type = String(h.card.front.type ?? '-');
      console.log(`[${h.card.id}] ${mark}${title} (${type}, ${h.score})`);
      console.log(`  路径: ${join(KNOWLEDGE_DIR, h.card.file)}`);
      console.log(`  摘要: ${summary(h.card.body)}`);
    }
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
