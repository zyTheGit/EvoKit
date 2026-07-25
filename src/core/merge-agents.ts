/**
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * EvoKit — Agent 文件合并工具
 *
 * 对 source_dir 中的每个 .md 文件：
 *   - 目标不存在 → 从源复制
 *   - 目标已存在 → 合并 YAML frontmatter（添加模板中缺失的字段）
 *
 * 替代 template/merge/install-agents.cjs
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

const KEY_ORDER = ['name', 'description', 'model', 'permission', 'memory', 'maxTurns'];

/**
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * 从 markdown 内容中解析 YAML frontmatter。
 * 返回 frontmatter 为扁平 Record<string, string> 以及正文文本。
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
  hasFrontmatter: boolean;
} {
  const lines = content.split('\n');
  if (lines.length < 2 || lines[0].trim() !== '---') {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  const fmLines = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join('\n');
  const frontmatter: Record<string, string> = {};

  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i].trim();
    if (!line || line.startsWith('#')) {
      i++;
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (!key) {
      i++;
      continue;
    }

    // 多行嵌套值：父键后无值，后续缩进行为子项
    if (value === '') {
      const childLines: string[] = [];
      let j = i + 1;
      while (j < fmLines.length) {
        const raw = fmLines[j];
        // 子行必须缩进（2 空格或 tab）
        if (raw && (raw.startsWith('  ') || raw.startsWith('\t'))) {
          childLines.push(raw.trim());
          j++;
        } else {
          break;
        }
      }
      if (childLines.length > 0) {
        // 序列化为逗号分隔的 "key: value" 字符串
        // 例如 "edit: deny, bash: deny"
        frontmatter[key] = childLines.join(', ');
        i = j;
      } else {
        frontmatter[key] = '';
        i++;
      }
    } else {
      frontmatter[key] = value;
      i++;
    }
  }

  return { frontmatter, body, hasFrontmatter: true };
}

/** 检查 frontmatter 值是否为序列化的嵌套映射（如 "edit: deny, bash: deny"） */
function isNestedMapping(value: string): boolean {
  return value.includes(': ') && value.includes(', ');
}

export function serializeFrontmatter(fm: Record<string, string>): string {
  const keys = Object.keys(fm).sort((a, b) => {
    const ai = KEY_ORDER.indexOf(a);
    const bi = KEY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  return keys
    .map((k) => {
      const v = fm[k];
      // 嵌套映射序列化为多行 YAML
      if (isNestedMapping(v)) {
        const entries = v.split(', ');
        const childLines = entries.map((e) => `  ${e}`).join('\n');
        return `${k}:\n${childLines}`;
      }
      return `${k}: ${v}`;
    })
    .join('\n');
}

/**
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * 将模板 frontmatter 合并到目标 frontmatter 中。
 * 仅添加目标中不存在的字段；不会覆盖已有字段。
 */
function mergeFrontmatter(
  targetFm: Record<string, string>,
  templateFm: Record<string, string>,
): [changed: boolean, merged: Record<string, string>] {
  let changed = false;
  const merged = { ...targetFm };
  for (const [key, value] of Object.entries(templateFm)) {
    if (!(key in merged)) {
      merged[key] = value;
      changed = true;
    }
  }
  return [changed, merged];
}

/** 通过临时文件 + 重命名实现原子写入 */
function writeAtomic(filePath: string, content: string): boolean {
  const tmp = filePath + '.merge.tmp';
  fs.writeFileSync(tmp, content, 'utf-8');
  // 验证
  const back = fs.readFileSync(tmp, 'utf-8');
  if (typeof back !== 'string' || back.length === 0) {
    fse.removeSync(tmp);
    return false;
  }
  fs.renameSync(tmp, filePath);
  return true;
}

export type AgentFileStatus = 'COPY' | 'MERGED' | 'SKIPPED' | `ERROR:${string}`;

export interface AgentFileResult {
  name: string;
  status: AgentFileStatus;
  /** 本次合并添加的 frontmatter 字段（用于清单记录） */
  fieldsAdded?: Record<string, string>;
}

/**
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * 从源目录安装或合并 agent .md 文件到目标目录。
 *
 * 返回每个文件处理结果的 { name, status } 数组。
 */
export function installOrMergeAgents(
  srcDir: string,
  dstDir: string,
  dryRun = false,
): AgentFileResult[] {
  if (!fse.existsSync(srcDir)) return [];
  fse.ensureDirSync(dstDir);

  const results: AgentFileResult[] = [];

  let files: string[];
  try {
    files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'));
  } catch {
    return results;
  }

  for (const file of files.sort()) {
    const srcPath = path.join(srcDir, file);
    const dstPath = path.join(dstDir, file);

    // 情况 1：目标不存在 → 复制
    if (!fse.existsSync(dstPath)) {
      if (dryRun) {
        results.push({ name: file, status: 'COPY' });
        continue;
      }
      try {
        const content = fs.readFileSync(srcPath, 'utf-8');
        if (!content) {
          results.push({ name: file, status: 'ERROR:empty source' });
          continue;
        }
        fs.writeFileSync(dstPath, content, 'utf-8');
        results.push({ name: file, status: 'COPY' });
      } catch (e: any) {
        results.push({ name: file, status: `ERROR:${e.message}` });
      }
      continue;
    }

    // 情况 2：目标已存在 → 合并 frontmatter
    if (dryRun) {
      results.push({ name: file, status: 'SKIPPED' });
      continue;
    }

    try {
      const srcContent = fs.readFileSync(srcPath, 'utf-8');
      const dstContent = fs.readFileSync(dstPath, 'utf-8');

      const srcParsed = parseFrontmatter(srcContent);
      const dstParsed = parseFrontmatter(dstContent);

      if (!dstParsed.hasFrontmatter) {
        // 目标没有 frontmatter — 在前面添加模板的 frontmatter
        const newContent =
          '---\n' + serializeFrontmatter(srcParsed.frontmatter) + '\n---\n' + dstParsed.body;
        if (!writeAtomic(dstPath, newContent)) {
          results.push({ name: file, status: 'ERROR:write failed' });
          continue;
        }
        // 所有模板字段均已添加
        results.push({ name: file, status: 'MERGED', fieldsAdded: { ...srcParsed.frontmatter } });
        continue;
      }

      // 合并：仅添加缺失字段
      const [changed, merged] = mergeFrontmatter(dstParsed.frontmatter, srcParsed.frontmatter);
      if (!changed) {
        results.push({ name: file, status: 'SKIPPED' });
        continue;
      }

      // 记录实际添加的字段（存在于合并结果中但不在原始数据中）
      const fieldsAdded: Record<string, string> = {};
      for (const [key, value] of Object.entries(merged)) {
        if (!(key in dstParsed.frontmatter)) {
          fieldsAdded[key] = value;
        }
      }

      const newContent = '---\n' + serializeFrontmatter(merged) + '\n---\n' + dstParsed.body;
      if (!writeAtomic(dstPath, newContent)) {
        results.push({ name: file, status: 'ERROR:write failed' });
        continue;
      }
      results.push({ name: file, status: 'MERGED', fieldsAdded });
    } catch (e: any) {
      results.push({ name: file, status: `ERROR:${e.message}` });
    }
  }

  return results;
}
