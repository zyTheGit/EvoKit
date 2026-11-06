// review 命令（T-M2.4 完整实现）：.pending 草稿清单 + 裁决（accept/reject/merge）+ --audit
// 纪律：accept = 校验 → 正文二次脱敏（FR-04 双点）→ 写库（confirmed + acceptedBy）→
//       索引重建（未知透传段保留，红线 #1）→ 独立 git commit（身份缺失仅警告跳过，不失败）；
//       reject/merge 只移动/退役，不物理删除（NFR-06 全链路只增不删）。
// 可复用导出：acceptDraft / rejectDraft / mergeDraft（learn 的 assist/auto 档调用）。

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { KNOWLEDGE_DIR, KNOWLEDGE_INDEX_FILE, PENDING_DIR, REJECTED_DIR } from '../paths.js';
import { listCards, mergeCards, readCardById, validateCard, writeCard } from '../knowledge-cards.js';
import { readIndex, rebuildIndex, writeIndex } from '../knowledge-index.js';
import { redact } from '../redact.js';
import { loadEngineConfig } from './harvest.js';

/**
 * `evokit review` 入口
 * @param {string[]} args 参数（不含 'review' 本身）：--list / --accept <id> / --reject <id> /
 *                        --merge <id> <into> / --audit（--skill 为 M4 预留）
 */
export function reviewCommand(args) {
  try {
    if (args.includes('--skill')) {
      console.log('ℹ review --skill（forge 技能草稿过目）尚未实现，计划在 M4 提供。');
      return;
    }
    if (args.includes('--audit')) {
      audit();
      return;
    }
    const acceptIdx = args.indexOf('--accept');
    if (acceptIdx !== -1) {
      const id = requireValue(args, acceptIdx, '--accept');
      const r = acceptDraft(id, { acceptedBy: 'manual' });
      console.log(`✓ 已入库 ${r.id}（status: confirmed${r.committed ? '，git commit ✓' : '，git 提交跳过'}${r.redactHits ? `，二次脱敏 ${r.redactHits} 处` : ''}）`);
      return;
    }
    const rejectIdx = args.indexOf('--reject');
    if (rejectIdx !== -1) {
      const id = requireValue(args, rejectIdx, '--reject');
      const r = rejectDraft(id);
      console.log(`✓ 已拒绝 ${r.id}（移入 ${r.to}）`);
      return;
    }
    const mergeIdx = args.indexOf('--merge');
    if (mergeIdx !== -1) {
      const id = requireValue(args, mergeIdx, '--merge');
      const intoId = args[mergeIdx + 2];
      if (!intoId || intoId.startsWith('-')) {
        throw new Error('--merge 需要两个值：--merge <草稿id> <既有卡id>');
      }
      const r = mergeDraft(id, intoId);
      console.log(`✓ 已合并 ${r.id} → ${r.intoId}（canonical 保留，索引已重建${r.committed ? '，git commit ✓' : ''}）`);
      return;
    }
    // 无参数 / --list：列清单
    listPending();
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

/** 解析 `--flag <id>` 的值；缺失即抛错（reviewCommand 统一捕获置退出码） */
function requireValue(args, idx, flag) {
  const v = args[idx + 1];
  if (!v || v.startsWith('-')) throw new Error(`${flag} 需要跟一个 id，例如 ${flag} <卡片id>`);
  return v;
}

/** id 只允许文件名安全字符（防路径穿越） */
function assertSafeId(id, flag = '--accept') {
  if (!id || typeof id !== 'string' || /[\\/]/.test(id) || id.includes('..') || id.startsWith('.')) {
    throw new Error(`${flag} 的 id 不合法：${id}`);
  }
}

/**
 * 接受草稿入库（CLI 与 learn 的 assist/auto 档共用）。
 * @param {string} id .pending 内草稿 id（文件名主干）
 * @param {{ acceptedBy?: 'auto' | 'manual' }} [opts]
 * @returns {{ id: string, committed: boolean, redactHits: number }}
 */
export function acceptDraft(id, opts = {}) {
  assertSafeId(id, '--accept');
  const card = readCardById(PENDING_DIR, id);
  if (!card) throw new Error(`待审草稿不存在：${id}（${PENDING_DIR}/${id}.md）`);
  const errors = validateCard(card.front);
  if (errors.length > 0) {
    throw new Error(`草稿不合法，拒绝入库 ${id}：\n  - ${errors.join('\n  - ')}`);
  }
  if (existsSync(join(KNOWLEDGE_DIR, `${id}.md`))) {
    throw new Error(`知识库已存在同名卡：${id}，拒绝覆盖`);
  }
  // 双点脱敏第二落点：入库前正文再过一遍（frontmatter 键值不动，只洗正文）
  const r = redact(card.body || '');
  const redactHits = r.hits.reduce((n, h) => n + h.count, 0);
  const front = {
    ...card.front,
    status: 'confirmed',
    acceptedBy: opts.acceptedBy === 'auto' ? 'auto' : 'manual',
    acceptedAt: new Date().toISOString(),
  };
  if (redactHits > 0) front.redactNote = `入库时二次脱敏 ${redactHits} 处`;
  const writtenId = writeCard(KNOWLEDGE_DIR, { front, body: r.text });
  refreshIndex();
  removePendingFile(id);
  const committed = gitCommit(`learn: ${front.title}`);
  return { id: writtenId, committed, redactHits };
}

/**
 * 拒绝草稿：移入 .rejected/（保留 90 天，物理清理由 knowledge gc 负责）。
 * @param {string} id
 * @returns {{ id: string, to: string }}
 */
export function rejectDraft(id) {
  assertSafeId(id, '--reject');
  const src = join(PENDING_DIR, `${id}.md`);
  if (!existsSync(src)) throw new Error(`待审草稿不存在：${id}（${PENDING_DIR}/${id}.md）`);
  mkdirSync(REJECTED_DIR, { recursive: true });
  let target = join(REJECTED_DIR, `${id}.md`);
  let i = 2;
  while (existsSync(target)) {
    target = join(REJECTED_DIR, `${id}-${i}.md`);
    i += 1;
  }
  renameSync(src, target);
  return { id, to: target };
}

/**
 * 合并草稿到既有卡：草稿先落库（保留原 id），再按 merge 语义退役为 tombstone
 * （被并卡 retired + mergedInto + validUntil；canonical 保留；索引只留 canonical）。
 * @param {string} id .pending 草稿 id
 * @param {string} intoId knowledge/ 既有 canonical 卡 id
 * @returns {{ id: string, intoId: string, committed: boolean }}
 */
export function mergeDraft(id, intoId) {
  assertSafeId(id, '--merge');
  assertSafeId(intoId, '--merge');
  const src = join(PENDING_DIR, `${id}.md`);
  if (!existsSync(src)) throw new Error(`待审草稿不存在：${id}（${PENDING_DIR}/${id}.md）`);
  if (!readCardById(KNOWLEDGE_DIR, intoId)) throw new Error(`既有卡不存在：${intoId}（knowledge/${intoId}.md）`);
  const dst = join(KNOWLEDGE_DIR, `${id}.md`);
  if (existsSync(dst)) throw new Error(`知识库已存在同名卡：${id}，无法合并`);
  renameSync(src, dst);
  mergeCards(KNOWLEDGE_DIR, intoId, id);
  refreshIndex();
  const committed = gitCommit(`learn: merge ${id} into ${intoId}`);
  return { id, intoId, committed };
}

/** 列出 .pending/*.md 草稿摘要 + 打印裁决命令（--list / 无参数） */
function listPending() {
  if (!existsSync(PENDING_DIR)) {
    console.log(`ℹ 知识根尚未初始化（缺 ${KNOWLEDGE_DIR}），先运行 \`evokit knowledge init\`。`);
    return;
  }
  const cards = listCards(PENDING_DIR);
  if (cards.length === 0) {
    console.log('✓ 暂无待审草稿（.pending/ 为空）。运行 `evokit learn` 从会话史提纯产出草稿。');
    return;
  }
  console.log(`📋 待审草稿（${cards.length} 张）— ${PENDING_DIR}\n`);
  cards.forEach((c, i) => {
    const title = String(c.front.title ?? '（无标题）');
    const conf = c.front.confidence !== undefined ? String(c.front.confidence) : '-';
    const type = c.front.type ? String(c.front.type) : '-';
    const verdict = c.front.verdict ? `  verdict=${c.front.verdict}` : '';
    const suspect = String(c.front.suspect) === 'true' || c.front.suspect === true ? '  ⚠suspect' : '';
    const tags = Array.isArray(c.front.tags) && c.front.tags.length > 0
      ? `  tags=${c.front.tags.map((t) => `#${t}`).join('')}`
      : '';
    const related = Array.isArray(c.front.related)
      ? c.front.related.join(', ')
      : (c.front.related !== undefined && c.front.related !== '' ? String(c.front.related) : '-');
    console.log(`  ${i + 1}. ${c.id}  「${title}」  type=${type}  confidence=${conf}${verdict}${tags}${suspect}`);
    console.log(`     related=${related}  source=${c.front.source ?? '-'}`);
  });
  console.log(`
裁决命令:
  evokit review --accept <id>        接受草稿入库（confirmed + 索引重建 + git commit）
  evokit review --reject <id>        拒绝草稿（移入 .rejected/，可人工恢复）
  evokit review --merge <id> <into>  并入既有卡（retired + mergedInto，canonical 保留）
  evokit review --audit              近期自动入库抽查（acceptedBy=auto + git log）`);
}

/** --audit：近期 acceptedBy=auto 的卡（listCards 过滤）+ 知识库 git log 尾 10 条 */
function audit() {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.log(`ℹ 知识根尚未初始化（缺 ${KNOWLEDGE_DIR}）。`);
    return;
  }
  const auto = listCards(KNOWLEDGE_DIR, { excludeHidden: true })
    .filter((c) => c.front.acceptedBy === 'auto')
    .sort((a, b) => String(b.front.acceptedAt || '').localeCompare(String(a.front.acceptedAt || '')))
    .slice(0, 10);
  if (auto.length === 0) {
    console.log('ℹ 近期没有 acceptedBy=auto 的入库卡。');
  } else {
    console.log(`🔍 近期自动入库（${auto.length} 张，按 acceptedAt 倒序，供抽查）:\n`);
    auto.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.id}  「${c.front.title}」  confidence=${c.front.confidence ?? '-'}  acceptedAt=${c.front.acceptedAt ?? '-'}`);
      console.log(`     source=${c.front.source ?? '-'}${String(c.front.suspect) === 'true' || c.front.suspect === true ? '  ⚠suspect' : ''}`);
    });
  }
  console.log('\n📜 知识库 git log（尾 10 条）:');
  if (!existsSync(join(KNOWLEDGE_DIR, '.git'))) {
    console.log('  （知识根不是 git 仓库，无提交历史）');
    return;
  }
  const r = spawnSync('git', ['-C', KNOWLEDGE_DIR, 'log', '--oneline', '-10'], { encoding: 'utf-8' });
  const out = (r.stdout || '').trim();
  if (r.error || r.status !== 0 || !out) {
    console.log(`  （无提交历史${r.stderr ? '：' + r.stderr.trim().split('\n')[0] : ''}）`);
    return;
  }
  for (const line of out.split('\n')) console.log(`  ${line}`);
}

/** 重建 EvoKit 索引桶；未知 `##` 透传段逐字保留（红线 #1），预算取 knowledge.indexBudget */
function refreshIndex() {
  const { knowledge } = loadEngineConfig();
  const budget = Number(knowledge.indexBudget) > 0 ? Number(knowledge.indexBudget) : 60;
  const cards = listCards(KNOWLEDGE_DIR, { excludeHidden: true });
  const { lines } = rebuildIndex(KNOWLEDGE_DIR, cards, budget);
  const { unknown } = readIndex(KNOWLEDGE_INDEX_FILE);
  writeIndex(KNOWLEDGE_INDEX_FILE, lines, unknown);
}

/** 删除 .pending 内草稿文件（accept 成功后调用；删除失败仅警告） */
function removePendingFile(id) {
  const f = join(PENDING_DIR, `${id}.md`);
  if (existsSync(f)) {
    try {
      rmSync(f);
    } catch (e) {
      console.warn(`⚠ 草稿文件删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * 知识库独立 git 提交（spawnSync；不配 remote，ADR 0009 §7）。
 * 非仓库 / add 失败 / 身份缺失 / 其他失败一律仅警告跳过，不失败（卡片已入库）。
 * @returns {boolean} 是否成功提交
 */
function gitCommit(message) {
  if (!existsSync(join(KNOWLEDGE_DIR, '.git'))) {
    console.warn('⚠ 知识根不是 git 仓库（先 evokit knowledge init），跳过版本化提交');
    return false;
  }
  const add = spawnSync('git', ['-C', KNOWLEDGE_DIR, 'add', '-A'], { encoding: 'utf-8' });
  if (add.error || add.status !== 0) {
    const msg = ((add.stderr || '') + (add.error ? ` ${add.error.message}` : '')).trim();
    console.warn(`⚠ git add 失败，跳过提交：${msg ? msg.split('\n')[0] : '未知原因'}`);
    return false;
  }
  const c = spawnSync('git', ['-C', KNOWLEDGE_DIR, 'commit', '-m', message], { encoding: 'utf-8' });
  if (c.error || c.status !== 0) {
    const err = ((c.stderr || '') + (c.stdout || '')).trim();
    if (/ident|user\.name|user\.email|who you are/i.test(err)) {
      console.warn('⚠ git 身份缺失（user.name/user.email），跳过提交（卡片已入库，可稍后手动 commit）');
    } else {
      console.warn(`⚠ git commit 失败，跳过：${err ? err.split('\n')[0] : '未知原因'}`);
    }
    return false;
  }
  return true;
}
