// review 命令（T-M2.4 完整实现）：.pending 草稿清单 + 裁决（accept/reject/merge）+ --audit
// M4 增量（T-M4.3）：--skill / --skill-accept / --skill-veto —— forge 技能草稿过目、symlink 分发与 .skill-lock.json 无损登记
// F1：--merge 双区定位（drop/into 各自查 .pending 与 knowledge/），双草稿合并纯 .pending 原地退役；
// F2：accept/merge 成功后由 CLI 编排层自动分发索引（autoSyncIndex，库函数不内嵌 sync）。
// 纪律：accept = 校验 → 正文二次脱敏（FR-04 双点）→ 写库（confirmed + acceptedBy）→
//       索引重建（未知透传段保留，红线 #1）→ 独立 git commit（身份缺失仅警告跳过，不失败）；
//       reject/merge 只移动/退役，不物理删除（NFR-06 全链路只增不删）。
// 可复用导出：acceptDraft / rejectDraft / mergeDraft（learn 的 assist/auto 档调用）。

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { AGENTS_SKILLS_DIR, KNOWLEDGE_DIR, KNOWLEDGE_INDEX_FILE, PENDING_DIR, REFERENCES_FILE, REJECTED_DIR, expandPath } from '../paths.js';
import { listCards, mergeCards, readCardById, validateCard, writeCard } from '../knowledge-cards.js';
import { readIndex, rebuildIndex, writeIndex } from '../knowledge-index.js';
import { redact } from '../redact.js';
import { loadEngineConfig } from './harvest.js';
import { makeSymlink } from '../fs-utils.js';
import { appendReference } from '../references.js';
import { autoSyncIndex } from './sync.js';

/**
 * `evokit review` 入口
 * @param {string[]} args 参数（不含 'review' 本身）：--list / --accept <id> / --reject <id> /
 *                        --merge <id> <into> / --skill / --skill-accept <name> / --skill-veto <name> / --audit
 */
export function reviewCommand(args) {
  try {
    if (args.includes('--skill')) {
      listSkillDrafts();
      return;
    }
    const skillAcceptIdx = args.indexOf('--skill-accept');
    if (skillAcceptIdx !== -1) {
      const name = requireValue(args, skillAcceptIdx, '--skill-accept', '<name>');
      acceptSkillDraft(name);
      return;
    }
    const skillVetoIdx = args.indexOf('--skill-veto');
    if (skillVetoIdx !== -1) {
      const name = requireValue(args, skillVetoIdx, '--skill-veto', '<name>');
      vetoSkillDraft(name);
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
      autoSyncIndex(); // F2：入库后自动分发索引（全局源缺失/失败均降级提示，不置退出码）
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
      if (r.zone === 'pending') {
        // F1 ①双草稿：纯 .pending 原地合并，无 git、无索引重建、不触发索引分发
        console.log(`✓ 已合并（草稿区）${r.id} → ${r.intoId}（canonical 保持 draft 留审，被并卡原位 retired）`);
      } else {
        console.log(`✓ 已合并 ${r.id} → ${r.intoId}（canonical 保留，索引已重建${r.committed ? '，git commit ✓' : ''}）`);
        autoSyncIndex(); // F2：drop 已进 knowledge（索引已重建的路径），自动分发索引
      }
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
function requireValue(args, idx, flag, example = '<卡片id>') {
  const v = args[idx + 1];
  if (!v || v.startsWith('-')) throw new Error(`${flag} 需要跟一个值，例如 ${flag} ${example}`);
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
 * 合并草稿到既有卡（F1 双区定位）：drop（id）与 canonical（intoId）各自在 .pending / knowledge 查找，
 * 四种组合：
 *   ① 双草稿（均在 .pending）→ mergeCards 原地合并（keep 保持 draft 留审，drop 原地 retired），
 *      无 git、无索引重建、不触发索引分发；
 *   ② 草稿→已入库 → 原路径：草稿落库（保留原 id）+ 按 merge 语义退役为 tombstone
 *      （被并卡 retired + mergedInto + validUntil；canonical 保留；索引只留 canonical）+ 索引重建 + git commit；
 *   ③ 双已入库 → 维持原行为（原报错，不在 review --merge 路径合并两张已入库卡）；
 *   ④ 已入库→草稿 → 报错提示改用 --merge <草稿id> <已入库id>。
 * 定位函数 pending/knowledge 双查，任一 id 都找不到 → 维持原报错文案。
 * @param {string} id 被并卡 id
 * @param {string} intoId canonical 卡 id
 * @returns {{ id: string, intoId: string, zone: 'pending' | 'knowledge', committed?: boolean }}
 *          zone='pending' 为双草稿合并（无 committed 字段）；zone='knowledge' 为原路径
 */
export function mergeDraft(id, intoId) {
  assertSafeId(id, '--merge');
  assertSafeId(intoId, '--merge');
  if (id === intoId) throw new Error('--merge 的两个 id 相同，拒绝与自身合并');
  const dropZone = locateCardZone(id);
  const intoZone = locateCardZone(intoId);
  // 未命中任何区：报错明示两区均查过（旧文案只提 knowledge/ 曾误导）
  if (!dropZone) throw new Error(`未找到卡：${id}（.pending/ 与 knowledge/ 均不存在该 id）`);
  if (!intoZone) throw new Error(`未找到卡：${intoId}（.pending/ 与 knowledge/ 均不存在该 id）`);
  // ④ 已入库→草稿：canonical 必须是已入库卡，方向反了直接报错
  if (dropZone === 'knowledge' && intoZone === 'pending') {
    throw new Error('canonical 应为已入库卡：请改用 --merge <草稿id> <已入库id>');
  }
  // ③ 双已入库：--merge 不支持合并两张已入库卡（报错明确，避免落入「待审草稿不存在」的歧义文案）
  if (dropZone === 'knowledge' && intoZone === 'knowledge') {
    throw new Error('两张卡均为已入库卡：review --merge 不支持合并两张已入库卡');
  }
  // ① 双草稿：.pending 内原地合并，canonical 保持 draft 留审
  if (dropZone === 'pending' && intoZone === 'pending') {
    mergeCards(PENDING_DIR, intoId, id);
    return { id, intoId, zone: 'pending' };
  }
  // ②③ 及未命中组合：维持原路径与原报错文案（含 ③ 双已入库）
  const src = join(PENDING_DIR, `${id}.md`);
  if (!existsSync(src)) throw new Error(`待审草稿不存在：${id}（${PENDING_DIR}/${id}.md）`);
  if (!readCardById(KNOWLEDGE_DIR, intoId)) throw new Error(`既有卡不存在：${intoId}（knowledge/${intoId}.md）`);
  const dst = join(KNOWLEDGE_DIR, `${id}.md`);
  if (existsSync(dst)) throw new Error(`知识库已存在同名卡：${id}，无法合并`);
  renameSync(src, dst);
  mergeCards(KNOWLEDGE_DIR, intoId, id);
  refreshIndex();
  const committed = gitCommit(`learn: merge ${id} into ${intoId}`);
  return { id, intoId, zone: 'knowledge', committed };
}

/** F1 双区定位：id 在 .pending/（'pending'）或 knowledge/（'knowledge'）；两区都不在返回 null */
function locateCardZone(id) {
  if (existsSync(join(PENDING_DIR, `${id}.md`))) return 'pending';
  if (readCardById(KNOWLEDGE_DIR, id)) return 'knowledge';
  return null;
}

/** 列出 .pending/*.md 草稿摘要 + 打印裁决命令（--list / 无参数） */
function listPending() {
  if (!existsSync(PENDING_DIR)) {
    console.log(`ℹ 知识根尚未初始化（缺 ${KNOWLEDGE_DIR}），先运行 \`evokit knowledge init\`。`);
    return;
  }
  const all = listCards(PENDING_DIR);
  // F1：retired 草稿（合并产物）不再展示，末尾单独提示（gc 时归档）
  const cards = all.filter((c) => String(c.front.status) !== 'retired');
  const retiredCount = all.length - cards.length;
  if (cards.length === 0) {
    console.log('✓ 暂无待审草稿（.pending/ 为空）。运行 `evokit learn` 从会话史提纯产出草稿。');
    if (retiredCount > 0) console.log(`ℹ 另有 ${retiredCount} 张 retired 草稿（合并产物，gc 时归档）。`);
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
  evokit review --skill              forge 技能草稿过目（--skill-accept <name> / --skill-veto <name> 裁决）
  evokit review --audit              近期自动入库抽查（acceptedBy=auto + git log）`);
  if (retiredCount > 0) console.log(`\nℹ 另有 ${retiredCount} 张 retired 草稿（合并产物，gc 时归档）。`);
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

// ── forge 技能草稿裁决（T-M4.3）：AGENTS_SKILLS_DIR 下含 generation.json 的 trial 技能 ──
// 分发落点（D5 裁决）：直接 symlink（复用 makeSymlink 的 junction 回退），不改写用户 settings.json 的 resources；
// .skill-lock.json（D6 裁决）：属于 skill 生态，EvoKit 只做无损追加，解析失败/结构不兼容则跳过并提示，绝不破坏原文件。

/** 默认分发目录（expandPath 展开；EVOKIT_HOME 隔离时随家目录走） */
const SKILL_DISTRIBUTE_TARGETS = ['~/.claude/skills', '~/.codex/skills'];

/** 技能名只允许目录名安全字符（防路径穿越） */
function assertSafeSkillName(name, flag) {
  if (!name || typeof name !== 'string' || /[\\/]/.test(name) || name.includes('..') || name.startsWith('.')) {
    throw new Error(`${flag} 的技能名不合法：${name}`);
  }
}

/** 读 <AGENTS_SKILLS_DIR>/<name>/generation.json；不存在/解析失败即抛错 */
function readSkillGeneration(name) {
  const file = join(AGENTS_SKILLS_DIR, name, 'generation.json');
  if (!existsSync(file)) {
    throw new Error(`技能草稿不存在（或缺少 generation.json）：${name}（${file}）`);
  }
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch (e) {
    throw new Error(`generation.json 解析失败：${name}（${e instanceof Error ? e.message : String(e)}）`);
  }
}

/** 原位写回 generation.json（缩进 2，与 forge 生成时同格式） */
function writeSkillGeneration(name, gen) {
  writeFileSync(join(AGENTS_SKILLS_DIR, name, 'generation.json'), JSON.stringify(gen, null, 2) + '\n', 'utf-8');
}

/** --skill：列出 trial 状态的技能草稿（name / parentCards 数 / generatedAt / topic） */
function listSkillDrafts() {
  if (!existsSync(AGENTS_SKILLS_DIR)) {
    console.log(`ℹ 技能源目录不存在（${AGENTS_SKILLS_DIR}）。先运行 \`evokit forge --from-tags <tags>\` 生成草稿。`);
    return;
  }
  const drafts = [];
  for (const ent of readdirSync(AGENTS_SKILLS_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const file = join(AGENTS_SKILLS_DIR, ent.name, 'generation.json');
    if (!existsSync(file)) continue; // 外来技能（无 forge 元数据）不在过目范围
    let gen = null;
    try {
      gen = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      continue; // 元数据损坏：不阻塞清单，forge --audit 会单独提示
    }
    if (gen && gen.review && gen.review.status === 'trial') drafts.push({ name: ent.name, gen });
  }
  if (drafts.length === 0) {
    console.log('✓ 暂无 trial 状态的技能草稿。运行 `evokit forge --from-tags <tags>` / `--topic "<主题>"` 生成。');
    return;
  }
  console.log(`🛠 forge 技能草稿（trial，${drafts.length} 个）— ${AGENTS_SKILLS_DIR}\n`);
  drafts.forEach((d, i) => {
    const parents = Array.isArray(d.gen.parentCards) ? d.gen.parentCards.length : 0;
    console.log(`  ${i + 1}. ${d.name}  父卡 ${parents} 张  generatedAt=${d.gen.generatedAt ?? '-'}  topic=${d.gen.topic || '-'}`);
  });
  console.log(`\n裁决命令:\n  evokit review --skill-accept <name>  通过并分发（symlink → ${SKILL_DISTRIBUTE_TARGETS.join('、')} + distributedTo 回写 + forge-use 引用 + .skill-lock.json 登记）\n  evokit review --skill-veto <name>    否决（vetoed，--audit 时提示）`);
}

/** .skill-lock.json 无损追加（D6）：数组则登记（同名条目就地更新），否则跳过并提示；原文件绝不破坏 */
function appendSkillLock(name, gen) {
  const lockFile = join(AGENTS_SKILLS_DIR, '.skill-lock.json');
  if (!existsSync(lockFile)) return '.skill-lock.json 不存在，未创建（按约定不代建）';
  let lock = null;
  try {
    lock = JSON.parse(readFileSync(lockFile, 'utf-8'));
  } catch (e) {
    return `⚠ .skill-lock.json 解析失败（${e instanceof Error ? e.message : String(e)}），跳过登记，原文件未动`;
  }
  if (!Array.isArray(lock)) return '⚠ .skill-lock.json 结构非数组，跳过登记，原文件未动';
  const entry = {
    name,
    sourceType: 'evokit',
    generatedAt: gen.generatedAt ?? null,
    parentCards: Array.isArray(gen.parentCards) ? gen.parentCards : [],
  };
  const idx = lock.findIndex((x) => x && typeof x === 'object' && x.name === name);
  if (idx === -1) lock.push(entry);
  else lock[idx] = { ...lock[idx], ...entry }; // 同名条目就地更新，其余条目无损
  try {
    writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
    return idx === -1 ? '.skill-lock.json 已无损追加登记' : '.skill-lock.json 同名条目已更新';
  } catch (e) {
    return `⚠ .skill-lock.json 写回失败（${e instanceof Error ? e.message : String(e)}），原文件未动`;
  }
}

/**
 * --skill-accept：人工过目通过 → 逐个 makeSymlink 分发 → 成功落点回写 distributedTo →
 * review.status=confirmed → 每个父卡追加 forge-use 引用 → .skill-lock.json 无损追加（D6）。
 * uses 不回填（由人工/工具计数，本期不做）。symlink 失败：回写已成功落点、保持 trial 并报错（可修复后重试）。
 */
function acceptSkillDraft(name) {
  assertSafeSkillName(name, '--skill-accept');
  const gen = readSkillGeneration(name);
  const review = gen.review && typeof gen.review === 'object' ? gen.review : {};
  const status = String(review.status || '');
  if (status === 'confirmed') {
    throw new Error(`技能 ${name} 已是 confirmed（重复 accept 会产生重复 forge-use 引用；如需重分发请手工处理）`);
  }
  if (status === 'vetoed') {
    throw new Error(`技能 ${name} 已被否决（vetoed）；如需恢复先手工把 generation.json 的 review 改回 trial`);
  }
  const parentCards = Array.isArray(gen.parentCards) ? gen.parentCards.map(String) : [];
  const sourceDir = join(AGENTS_SKILLS_DIR, name);
  const okTargets = [];
  const failed = [];
  for (const dir of SKILL_DISTRIBUTE_TARGETS) {
    try {
      makeSymlink(sourceDir, join(expandPath(dir), name));
      okTargets.push(expandPath(dir));
    } catch (e) {
      failed.push(`${dir}：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed.length > 0) {
    gen.distributedTo = okTargets; // 回写已成功部分
    writeSkillGeneration(name, gen);
    for (const f of failed) console.error(`  ✗ 分发失败 ${f}`);
    throw new Error(`symlink 分发失败 ${failed.length}/${SKILL_DISTRIBUTE_TARGETS.length}（已回写成功落点，review.status 保持 trial，可修复后重试 --skill-accept ${name}）`);
  }
  gen.distributedTo = okTargets;
  gen.review = { ...review, status: 'confirmed' };
  writeSkillGeneration(name, gen);
  let refCount = 0;
  for (const cardId of parentCards) {
    try {
      appendReference(REFERENCES_FILE, { type: 'forge-use', cardId });
      refCount += 1;
    } catch (e) {
      console.warn(`⚠ forge-use 引用写入失败（cardId=${cardId}）：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const lockMsg = appendSkillLock(name, gen);
  console.log(`✓ 技能 ${name} 已确认并分发：`);
  for (const dir of okTargets) console.log(`  · ${join(dir, name)}`);
  console.log(`  review.status=confirmed · distributedTo ${okTargets.length} 处 · forge-use 引用 ${refCount} 条 · ${lockMsg}`);
}

/** --skill-veto：人工否决（review.vetoed=true + status=vetoed）；分发链接不动，forge --audit 提示已否决 */
function vetoSkillDraft(name) {
  assertSafeSkillName(name, '--skill-veto');
  const gen = readSkillGeneration(name);
  const review = gen.review && typeof gen.review === 'object' ? gen.review : {};
  gen.review = { ...review, vetoed: true, status: 'vetoed' };
  writeSkillGeneration(name, gen);
  console.log(`✓ 技能 ${name} 已否决（review.vetoed=true + status=vetoed）；分发链接未动，\`evokit forge --audit\` 会提示已否决。`);
}
