// 文件系统工具：读取源、托管块、软链接创建

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync,
  rmSync, symlinkSync, lstatSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { BEGIN, END } from './paths.js';

/** 读取源文件内容（trim 去首尾空白） */
export function readSource(file) {
  return readFileSync(file, 'utf-8').trim();
}

/** 用托管块边界包裹源内容 */
export function applyBlock(source) {
  return `${BEGIN}\n${source}\n${END}\n`;
}

/**
 * 将源内容合并进目标文件，只更新托管块（BEGIN...END），保留块外用户内容。
 * 这是 sync 的核心安全策略：绝不整文件覆盖，避免抹掉用户手写的块外内容。
 *
 * 行为：
 *   - 目标不存在 → 直接写入托管块（首次同步）
 *   - 目标存在且含托管块 → 只替换 BEGIN...END 之间，块外内容原样保留
 *   - 目标存在但不含托管块 → 追加托管块到文件末尾（不破坏已有内容）
 *
 * @param {string} file 目标文件路径
 * @param {string} source 源内容（会被包裹进托管块）
 * @returns {'created'|'updated'|'appended'} 本次操作类型
 */
export function applyManagedBlock(file, source) {
  const block = applyBlock(source);
  if (!existsSync(file)) {
    writeFileSync(file, block, 'utf-8');
    return 'created';
  }
  const content = readFileSync(file, 'utf-8');
  const beginIdx = content.indexOf(BEGIN);
  const endIdx = content.indexOf(END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // 已有托管块：只替换块内部，块外内容不动
    const before = content.slice(0, beginIdx);
    const after = content.slice(endIdx + END.length);
    writeFileSync(file, before + block + after, 'utf-8');
    return 'updated';
  }
  // 无托管块：追加到末尾，保证已有内容不丢失
  const sep = content.endsWith('\n') ? '' : '\n';
  writeFileSync(file, content + sep + block, 'utf-8');
  return 'appended';
}

/** 创建源文件；已存在则跳过 */
export function ensureSource(file, content) {
  if (existsSync(file)) {
    console.log(`ℹ ${file} 已存在，跳过`);
    return false;
  }
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, content, 'utf-8');
  console.log(`✓ 已创建 ${file}`);
  return true;
}

/**
 * 创建一个软链接：Windows 用 junction，其他平台用符号链接（自动探测）。
 * 数据保护：目标已是真实目录时拒绝覆盖（不误删用户数据）。
 */
export function makeSymlink(source, target) {
  const src = resolve(source);
  const tgt = resolve(target);
  // 目标已存在则先清理，但只清理软链接/junction，绝不删除真实目录
  try {
    const st = lstatSync(tgt);
    if (st.isSymbolicLink()) {
      unlinkSync(tgt); // 符号链接：删除链接本身，不跟随
    } else if (st.isDirectory() && process.platform === 'win32') {
      rmSync(tgt, { recursive: false, force: true }); // junction 被报告为目录时删链接点
    } else if (st.isDirectory()) {
      throw new Error(`目标已是真实目录，拒绝覆盖以保护数据：${tgt}（请先手动移除或改名）`);
    } else {
      unlinkSync(tgt); // 普通文件占位
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      // 目标不存在，无需清理
    } else if (e.message && e.message.includes('拒绝覆盖')) {
      throw e;
    }
    // 其他错误（如权限）继续尝试创建，可能后续报错
  }
  // 确保目标父目录存在
  const parent = dirname(tgt);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

  if (process.platform === 'win32') {
    symlinkSync(src, tgt, 'junction');
    return 'junction';
  }
  symlinkSync(src, tgt, 'dir');
  return 'symlink';
}
