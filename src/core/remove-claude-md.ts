/**
 * EvoKit — 移除 CLAUDE.md 区段
 *
 * 从 CLAUDE.md 文件中移除 EvoKit 追加的区段。
 * 如果 EvoKit 创建了整个文件（标记在第 1 行且之前
 * 没有用户内容），则直接删除文件。
 * 如果 EvoKit 追加到已有文件，则仅移除追加的
 * 区段（从标记行到文件末尾）。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import fse from 'fs-extra';

/** 移除 CLAUDE.md 区段的结果 */
export interface RemoveClaudeMdResult {
  /** 执行结果：section-removed（区段已移除）、file-deleted（文件已删除）或 skipped（已跳过） */
  action: 'section-removed' | 'file-deleted' | 'skipped';
  /** 如果发现可能属于用户的内容时发出的警告 */
  warning?: string;
}

/**
 * 从 CLAUDE.md 文件中移除 EvoKit 区段。
 *
 * 在文件内容中搜索 `appendMarker`。如果标记位于文件最开头
 * （前面没有实际用户内容），则删除整个文件。如果标记前
 * 存在用户内容，则仅移除从标记到文件末尾的区段，
 * 同时清理 `---` 分隔符和末尾空行。
 *
 * 如果未找到标记或文件不存在，返回 `action: 'skipped'`。
 */
export function removeClaudeMdSection(
  claudeMdPath: string,
  appendMarker: string,
  dryRun = false,
): RemoveClaudeMdResult {
  // 文件不存在 → 跳过
  if (!fse.existsSync(claudeMdPath)) {
    return { action: 'skipped' };
  }

  let content: string;
  try {
    content = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    /* 文件不可读（权限或编码问题）— 跳过 */
    return { action: 'skipped' };
  }

  // 未找到标记 → 跳过
  const markerIdx = content.indexOf(appendMarker);
  if (markerIdx === -1) {
    return { action: 'skipped' };
  }

  // 标记之前的内容
  const beforeMarker = content.slice(0, markerIdx);

  // 检查 EvoKit 是否创建了整个文件：
  // - beforeMarker 仅包含空白、markdown 标题前缀（#）和/或 --- 分隔符
  const cleanedBefore = beforeMarker.replace(/---/g, '').replace(/#+/g, '').trim();

  if (cleanedBefore === '') {
    // EvoKit 创建了整个文件 → 删除它
    if (!dryRun) {
      fse.removeSync(claudeMdPath);
    }
    return { action: 'file-deleted' };
  }

  // EvoKit 追加到已有文件 → 移除从标记到文件末尾的区段
  // 同时清理标记前的 --- 分隔符、标题标记和末尾空行
  let trimmed = beforeMarker;

  // 移除末尾的 --- 分隔符和空行
  trimmed = trimmed.replace(/\n*---\s*\n*$/, '');
  // 移除末尾的标题标记（#）和空行
  trimmed = trimmed.replace(/\n*#+\s*$/, '');
  // 移除末尾空行
  trimmed = trimmed.replace(/\n+$/, '');

  // 清理后文件为空 → 删除它
  if (trimmed.trim() === '') {
    if (!dryRun) {
      fse.removeSync(claudeMdPath);
    }
    return { action: 'file-deleted' };
  }

  // 确保文件以单个换行符结尾
  const newContent = trimmed + '\n';

  if (!dryRun) {
    // 原子写入
    const tmpPath = claudeMdPath + '.reverse.tmp';
    fs.writeFileSync(tmpPath, newContent, 'utf-8');
    try {
      fs.renameSync(tmpPath, claudeMdPath);
    } catch {
      /* 原子重命名失败（跨设备或权限问题）— 丢弃临时文件 */
      fse.removeSync(tmpPath);
    }
  }

  return { action: 'section-removed' };
}
