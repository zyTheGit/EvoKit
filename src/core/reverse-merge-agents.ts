/**
 * EvoKit — 反向合并 Agent Frontmatter
 *
 * 撤销安装时执行的 agent .md 文件 frontmatter 合并操作。
 * 移除 EvoKit 添加的 frontmatter 字段，同时保留用户添加的字段。
 * 如果所有 frontmatter 被移除且正文为空，则删除该文件。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { atomicWriteFile } from './atomic-write.js';
import { parseFrontmatter, serializeFrontmatter } from './merge-agents.js';
import type { ManifestAgentFrontmatter } from './manifest.js';

/** 单个 agent 文件的反向 frontmatter 结果 */
export interface ReverseAgentResult {
  /** Agent 文件名（如 'architect.md'） */
  file: string;
  /** 执行结果：cleaned = 字段已移除，deleted = 文件已删除，skipped = 无变更 */
  action: 'cleaned' | 'deleted' | 'skipped';
  /** 移除的 frontmatter 字段数 */
  fieldsRemoved: number;
}

/**
 * 反向合并 agent frontmatter — 移除 EvoKit 添加的字段。
 *
 * 对于清单中记录的每个 agent 文件，读取文件、解析 frontmatter、
 * 移除与记录的键值对匹配的字段，然后重写文件。如果所有
 * frontmatter 被移除且正文为空/仅空白，则删除该文件。
 */
export function reverseMergeAgents(
  agentsDir: string,
  agentRecords: ManifestAgentFrontmatter[],
  dryRun = false,
): ReverseAgentResult[] {
  const results: ReverseAgentResult[] = [];

  for (const record of agentRecords) {
    const filePath = path.join(agentsDir, record.file);

    // 文件不存在则跳过
    if (!fse.existsSync(filePath)) {
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      /* 文件不可读（权限或编码问题）— 跳过此 agent */
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    const parsed = parseFrontmatter(content);

    // 无 frontmatter 则跳过
    if (!parsed.hasFrontmatter) {
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    // 移除匹配的字段
    let fieldsRemoved = 0;
    for (const [key, value] of Object.entries(record.fields)) {
      if (parsed.frontmatter[key] === value) {
        delete parsed.frontmatter[key];
        fieldsRemoved++;
      }
    }

    if (fieldsRemoved === 0) {
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    // 如果所有 frontmatter 被移除且正文为空/仅空白 → 删除文件
    const remainingKeys = Object.keys(parsed.frontmatter);
    if (remainingKeys.length === 0 && parsed.body.trim() === '') {
      if (!dryRun) {
        fse.removeSync(filePath);
      }
      results.push({ file: record.file, action: 'deleted', fieldsRemoved });
      continue;
    }

    // 否则用清理后的 frontmatter 重写
    if (!dryRun) {
      let newContent: string;
      if (remainingKeys.length === 0) {
        // 没有剩余的 frontmatter — 只写入正文
        newContent = parsed.body;
      } else {
        newContent = '---\n' + serializeFrontmatter(parsed.frontmatter) + '\n---\n' + parsed.body;
      }

      // 原子写入
      atomicWriteFile(filePath, newContent, { tmpSuffix: '.reverse.tmp' });
    }

    results.push({ file: record.file, action: 'cleaned', fieldsRemoved });
  }

  return results;
}
