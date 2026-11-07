// knowledge 命令：知识根初始化（M0 骨架）/ gc 归档（T-M5.3 实实现）
// 计划 §2.4：init 建根（knowledge/、.pending/、.rejected/、索引骨架、git init + .gitignore）并体检 git 身份
// gc 纪律（红线 #8「过期不删除」的唯一显式物理清理入口）：
//   retired / validUntil < before 的卡移入 .archive/（重名加时间戳）；F1 合并产生的草稿区 retired 卡
//   （.pending/ 内 status:retired）一并移入 .archive/；.rejected/ 中 mtime 超
//   knowledge.rejectedRetentionDays（默认 90 天）的文件删除；gc 后重建索引（未知透传段保留，红线 #1）
//   + 独立 git commit（身份缺失仅警告跳过）；--dry-run 只列表不移动（库内/草稿区分组显示）。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHIVE_DIR, KNOWLEDGE_DIR, KNOWLEDGE_INDEX_FILE, PENDING_DIR, REJECTED_DIR } from '../paths.js';
import { listCards } from '../knowledge-cards.js';
import { readIndex, rebuildIndex, writeIndex } from '../knowledge-index.js';
import { loadEngineConfig } from './harvest.js';

/** 解析 `--flag <value>`；缺失返回 null */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('-') ? v : null;
}

/** 本地日期 YYYY-MM-DD（--before 缺省值） */
function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 文件名安全时间戳：YYYYMMDDTHHMMSS（归档重名后缀用） */
function fileStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
}

/**
 * `evokit knowledge <子命令>` 入口
 * @param {string[]} args 子命令及参数（不含 'knowledge' 本身）
 */
export function knowledgeCommand(args) {
  const sub = args[0] || '';
  if (sub === 'init') return knowledgeInit();
  if (sub === 'gc') return knowledgeGc(args.slice(1));
  console.log(`用法：evokit knowledge <init|gc>
  evokit knowledge init   初始化知识根（目录树 + 索引骨架 + git init + 环境体检）
  evokit knowledge gc     归档失效卡（retired / validUntil 过期）+ 清理 .rejected 超期文件（--before <YYYY-MM-DD> / --dry-run）`);
  if (sub) process.exitCode = 1;
}

/** 初始化知识根：幂等，重复执行不覆盖已有内容 */
function knowledgeInit() {
  // 1. 目录树
  for (const dir of [KNOWLEDGE_DIR, PENDING_DIR, REJECTED_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`✓ 已创建 ${dir}`);
    } else {
      console.log(`ℹ 已存在，跳过 ${dir}`);
    }
  }

  // 2. 索引骨架（已存在则不覆盖——用户手写透传段绝不重建）
  if (!existsSync(KNOWLEDGE_INDEX_FILE)) {
    writeIndex(KNOWLEDGE_INDEX_FILE, [], []);
    console.log(`✓ 已创建索引骨架 ${KNOWLEDGE_INDEX_FILE}`);
  } else {
    console.log(`ℹ 索引已存在，跳过 ${KNOWLEDGE_INDEX_FILE}`);
  }

  // 3. .gitignore：草稿/拒绝/归档目录不进版本库
  const gitignore = join(KNOWLEDGE_DIR, '.gitignore');
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, '.pending/\n.rejected/\n.archive/\n', 'utf-8');
    console.log(`✓ 已创建 ${gitignore}（忽略 .pending/ .rejected/ .archive/）`);
  } else {
    console.log(`ℹ 已存在，跳过 ${gitignore}`);
  }

  // 4. 知识库独立 git init（不配置 remote，ADR 0009 §7）
  const gitDir = join(KNOWLEDGE_DIR, '.git');
  if (!existsSync(gitDir)) {
    const r = spawnSync('git', ['init', KNOWLEDGE_DIR], { stdio: 'pipe', encoding: 'utf-8' });
    if (r.error || r.status !== 0) {
      console.warn(`⚠ git init 失败${r.error ? '（git 不可用）' : `：${(r.stderr || '').trim()}`}，知识库暂无版本化，可稍后手动执行`);
    } else {
      console.log(`✓ 已初始化独立 git 仓库 ${KNOWLEDGE_DIR}`);
    }
  } else {
    console.log(`ℹ 已是 git 仓库，跳过 ${gitDir}`);
  }

  // 5. git 身份体检：缺失仅警告不失败（后续 review 入库时跳过 commit，卡片照常落盘）
  const missing = [];
  for (const key of ['user.name', 'user.email']) {
    const r = spawnSync('git', ['config', key], { cwd: KNOWLEDGE_DIR, stdio: 'pipe', encoding: 'utf-8' });
    if (r.error || r.status !== 0 || !(r.stdout || '').trim()) missing.push(key);
  }
  if (missing.length > 0) {
    console.warn(`⚠ git 未配置 ${missing.join(' / ')}，review 接受草稿时将跳过 git 提交（不影响入库）`);
  }
}

/** 卡片是否该归档：status: retired，或 validUntil（YYYY-MM-DD）严格早于 before（validUntil=当天仍有效） */
function isExpired(card, before) {
  if (String(card.front.status) === 'retired') return true;
  const vu = card.front.validUntil;
  return typeof vu === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(vu) && vu < before;
}

/**
 * 把一张卡移入 .archive/（重名加时间戳后缀，再撞名递增序号）。
 * @param {string} dir 卡片所在基目录（knowledge/ 或 F1 草稿区 .pending/）
 * @param {{ id: string, file: string, front: Record<string, unknown> }} card listCards 产物
 * @param {string} stamp 时间戳后缀（同一轮 gc 共用）
 * @returns {boolean} 是否移动成功
 */
function archiveCardFile(dir, card, stamp) {
  const src = join(dir, card.file);
  const m = card.file.match(/([^/]+)$/);
  const base = m ? m[1] : card.file;
  const stem = base.replace(/\.md$/i, '');
  let target = join(ARCHIVE_DIR, base);
  for (let i = 1; existsSync(target); i += 1) {
    target = join(ARCHIVE_DIR, i === 1 ? `${stem}-${stamp}.md` : `${stem}-${stamp}-${i}.md`);
  }
  try {
    renameSync(src, target);
    return true;
  } catch (e) {
    console.warn(`⚠ 归档失败 ${card.id}：${String(e instanceof Error ? e.message : e).split('\n')[0]}`);
    return false;
  }
}

/**
 * knowledge gc 主体（T-M5.3）：归档失效卡 + 清理 .rejected 超期文件 + 重建索引 + 独立 git commit。
 * @param {string[]} args 参数（不含 'gc' 本身）：--before <YYYY-MM-DD>（缺省=今天）/ --dry-run
 */
function knowledgeGc(args) {
  const before = flagValue(args, '--before') || todayLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before) || Number.isNaN(new Date(`${before}T00:00:00`).getTime())) {
    console.error(`✗ --before 需要合法的 YYYY-MM-DD 日期，当前为「${before}」`);
    process.exitCode = 1;
    return;
  }
  const dryRun = args.includes('--dry-run');
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.log(`ℹ 知识根尚未初始化（缺 ${KNOWLEDGE_DIR}），先运行 \`evokit knowledge init\`。`);
    return;
  }

  // 1. 失效卡：retired / validUntil < before（knowledge/ 递归，跳过隐藏目录）
  const cards = listCards(KNOWLEDGE_DIR, { excludeHidden: true });
  const toArchive = cards.filter((c) => isExpired(c, before));

  // 1b. 草稿区 retired 卡（F1 合并产物）：一并移入 .archive/（.pending 与 .archive 均 gitignored，纯文件移动不涉 git）
  const pendingRetired = listCards(PENDING_DIR).filter((c) => String(c.front.status) === 'retired');

  // 2. .rejected 超期文件（mtime 超过 knowledge.rejectedRetentionDays，默认 90）
  const { knowledge } = loadEngineConfig();
  const retention = Number(knowledge.rejectedRetentionDays) > 0 ? Number(knowledge.rejectedRetentionDays) : 90;
  const cutoff = Date.now() - retention * 86400000;
  const toClean = [];
  if (existsSync(REJECTED_DIR)) {
    for (const ent of readdirSync(REJECTED_DIR, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      try {
        if (statSync(join(REJECTED_DIR, ent.name)).mtimeMs < cutoff) toClean.push(ent.name);
      } catch {
        // stat 失败跳过，下轮 gc 再看
      }
    }
  }
  toClean.sort();

  // 3. 列表（--dry-run 只列表不移动；库内与草稿区分组显示）
  console.log(`🧹 knowledge gc — before=${before}${dryRun ? '（dry-run，只列表不改动）' : ''}`);
  if (toArchive.length > 0) console.log(`  库内 ${toArchive.length} 张：`);
  for (const c of toArchive) {
    const reason = String(c.front.status) === 'retired' ? 'status=retired' : `validUntil=${c.front.validUntil}`;
    console.log(`  [归档] ${c.id} 「${c.front.title ?? ''}」 ${reason}`);
  }
  if (pendingRetired.length > 0) console.log(`  草稿区 ${pendingRetired.length} 张：`);
  for (const c of pendingRetired) {
    console.log(`  [归档] ${c.id} 「${c.front.title ?? ''}」 status=retired（.pending）`);
  }
  for (const name of toClean) {
    console.log(`  [清理] .rejected/${name}（mtime 超过 ${retention} 天）`);
  }
  if (toArchive.length === 0 && pendingRetired.length === 0 && toClean.length === 0) console.log('  （无失效卡、无超期文件）');

  // 4. 执行（dry-run 到此为止；无改动时不重建索引、不产生空提交）
  let archived = 0;
  let cleaned = 0;
  if (!dryRun && (toArchive.length > 0 || pendingRetired.length > 0 || toClean.length > 0)) {
    if (toArchive.length > 0 || pendingRetired.length > 0) {
      mkdirSync(ARCHIVE_DIR, { recursive: true });
      const stamp = fileStamp();
      for (const c of toArchive) {
        if (archiveCardFile(KNOWLEDGE_DIR, c, stamp)) archived += 1;
      }
      for (const c of pendingRetired) {
        if (archiveCardFile(PENDING_DIR, c, stamp)) archived += 1;
      }
    }
    for (const name of toClean) {
      try {
        rmSync(join(REJECTED_DIR, name));
        cleaned += 1;
      } catch (e) {
        console.warn(`⚠ 清理失败 .rejected/${name}：${String(e instanceof Error ? e.message : e).split('\n')[0]}`);
      }
    }
    refreshIndexAfterGc();
    gitCommitGc(`gc: archive ${archived} cards`);
  }

  // 5. 汇总（剩余 confirmed 以当前 knowledge/ 实况为准；归档计数含草稿区 retired 卡）
  const totalArchive = toArchive.length + pendingRetired.length;
  const confirmedLeft = listCards(KNOWLEDGE_DIR, { excludeHidden: true })
    .filter((c) => String(c.front.status) === 'confirmed').length;
  console.log(`\n📊 gc 汇总${dryRun ? '（dry-run，未改动任何文件）' : ''}：归档 ${dryRun ? totalArchive : archived} 张 · 清理 .rejected ${dryRun ? toClean.length : cleaned} 个 · 剩余 confirmed ${confirmedLeft} 张`);
}

/** gc 后重建 EvoKit 索引桶；未知 `##` 透传段逐字保留（红线 #1），预算取 knowledge.indexBudget */
function refreshIndexAfterGc() {
  const { knowledge } = loadEngineConfig();
  const budget = Number(knowledge.indexBudget) > 0 ? Number(knowledge.indexBudget) : 60;
  const cards = listCards(KNOWLEDGE_DIR, { excludeHidden: true });
  const { lines } = rebuildIndex(KNOWLEDGE_DIR, cards, budget);
  const { unknown } = readIndex(KNOWLEDGE_INDEX_FILE);
  writeIndex(KNOWLEDGE_INDEX_FILE, lines, unknown);
}

/**
 * gc 的知识库独立 git 提交（spawnSync；不配 remote，ADR 0009 §7）。
 * 非仓库 / add 失败 / 身份缺失 / 其他失败一律仅警告跳过，不影响归档结果（卡片已安全移入 .archive/）。
 * @param {string} message 提交信息（如 `gc: archive 2 cards`）
 * @returns {boolean} 是否成功提交
 */
function gitCommitGc(message) {
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
      console.warn('⚠ git 身份缺失（user.name/user.email），跳过提交（归档已完成，可稍后手动 commit）');
    } else {
      console.warn(`⚠ git commit 失败，跳过：${err ? err.split('\n')[0] : '未知原因'}`);
    }
    return false;
  }
  return true;
}
