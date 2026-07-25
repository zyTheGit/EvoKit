/**
 * EvoKit — 原子写入工具
 *
 * 提供 atomicWriteFile 函数，实现"临时文件 → 验证 → 备份 → 重命名"的
 * 原子写入模式。统一 merge-settings、reverse-merge-settings、
 * reverse-merge-agents 中的重复实现。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import fse from 'fs-extra';

/** atomicWriteFile 的选项 */
export interface AtomicWriteOptions {
  /** 临时文件后缀（默认 '.tmp'） */
  tmpSuffix?: string;
  /** 验证函数：写入临时文件后调用，返回 false 则中止写入并清理 */
  validate?: (tmpPath: string) => boolean;
  /** 是否备份原文件；true 使用默认后缀 '.bak.evokit'，string 则作为自定义后缀 */
  backup?: boolean | string;
  /** 写入编码（默认 'utf-8'） */
  encoding?: BufferEncoding;
}

/** atomicWriteFile 的结果 */
export interface AtomicWriteResult {
  /** 是否写入成功 */
  ok: boolean;
  /** 失败时的错误信息 */
  error?: string;
  /** 备份文件路径（仅在 backup 选项启用且原文件存在时设置） */
  backupPath?: string;
}

/**
 * 原子写入文件：临时文件 → 验证 → 备份 → 重命名。
 *
 * 流程：
 * 1. 将内容写入目标路径 + tmpSuffix 的临时文件
 * 2. 若提供 validate，对临时文件执行验证；验证失败则清理并返回失败
 * 3. 若 backup 选项启用且原文件存在，将原文件重命名为备份路径
 * 4. 将临时文件重命名为目标路径
 * 5. 任何步骤失败均尝试回滚（恢复原文件、清理临时文件）
 *
 * @param targetPath 目标文件路径
 * @param content 要写入的内容
 * @param options 选项（验证、备份、临时文件后缀等）
 * @returns 写入结果
 */
export function atomicWriteFile(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {},
): AtomicWriteResult {
  const { tmpSuffix = '.tmp', validate, backup = false, encoding = 'utf-8' } = options;

  const tmpPath = targetPath + tmpSuffix;

  // 1. 写入临时文件
  try {
    fs.writeFileSync(tmpPath, content, encoding);
  } catch (e: any) {
    return { ok: false, error: `无法写入临时文件: ${e.message}` };
  }

  // 2. 可选验证
  if (validate) {
    try {
      const valid = validate(tmpPath);
      if (!valid) {
        fse.removeSync(tmpPath);
        return { ok: false, error: '写入验证失败' };
      }
    } catch {
      fse.removeSync(tmpPath);
      return { ok: false, error: '写入验证失败' };
    }
  }

  // 3. 可选备份
  const backupSuffix = backup === true ? '.bak.evokit' : typeof backup === 'string' ? backup : '';
  const backupPath = backupSuffix ? targetPath + backupSuffix : undefined;

  if (backupPath && fs.existsSync(targetPath)) {
    // 先移除旧备份（如果存在）
    fse.removeSync(backupPath);
    try {
      fs.renameSync(targetPath, backupPath);
    } catch (e: any) {
      fse.removeSync(tmpPath);
      return { ok: false, error: `无法备份: ${e.message}` };
    }
  }

  // 4. 重命名临时文件为目标文件
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (e: any) {
    // 回滚：恢复备份
    if (backupPath && fs.existsSync(backupPath)) {
      try {
        fs.renameSync(backupPath, targetPath);
      } catch {
        // 备份恢复也失败——灾难性错误，无法进一步处理
      }
    }
    fse.removeSync(tmpPath);
    return { ok: false, error: `无法写入: ${e.message}` };
  }

  return { ok: true, backupPath };
}
