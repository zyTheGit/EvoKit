// knowledge 命令：知识根初始化（M0 骨架）/ gc 归档（M5 提供）
// 计划 §2.4：init 建根（knowledge/、.pending/、.rejected/、索引骨架、git init + .gitignore）并体检 git 身份

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWLEDGE_DIR, KNOWLEDGE_INDEX_FILE, PENDING_DIR, REJECTED_DIR } from '../paths.js';
import { writeIndex } from '../knowledge-index.js';

/**
 * `evokit knowledge <子命令>` 入口
 * @param {string[]} args 子命令及参数（不含 'knowledge' 本身）
 */
export function knowledgeCommand(args) {
  const sub = args[0] || '';
  if (sub === 'init') return knowledgeInit();
  if (sub === 'gc') {
    console.log('ℹ knowledge gc 尚未实现（计划在 M5 提供：把长期失效卡归档至 .archive/，不删除）。');
    return;
  }
  console.log(`用法：evokit knowledge <init|gc>
  evokit knowledge init   初始化知识根（目录树 + 索引骨架 + git init + 环境体检）
  evokit knowledge gc     归档长期失效卡（M5 提供，本期未实现）`);
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
