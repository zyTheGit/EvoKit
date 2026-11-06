// 入口文件托管块内容组装（记忆引擎 v3 T-M3.1）
//
// 背景：v3 引入 knowledge-index 资源后，同一入口文件（如 ~/.claude/CLAUDE.md）会被
// 多个 text 资源指向（context + knowledge-index）。托管块保持「一文件一块」不变量
// （uninstall/check/status 都按单块解析），因此同步时必须把指向同一文件的全部 text
// 资源内容【合并】进同一块，而不是各写各的互相覆盖。
//
// 缺失源的可恢复性分级：
//   - 知识根下（knowledge-index.md）→ 可恢复（知识库 git 版本化 + 可由卡片重建），
//     缺失时降级为提示并用剩余内容写入；
//   - 其余（如 context.md）→ 不可恢复（用户唯一手写源），缺失时拒绝部分写入，
//     避免把托管块里现存的该资源内容清掉。

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandPath, KNOWLEDGE_DIR } from './paths.js';
import { loadResources } from './config.js';
import { readSource } from './fs-utils.js';
import { isRemote } from './remote.js';

/** 资源是否为 text 型（未写 type 且非 http(s) 源也视为 text，与 syncers 分派规则一致） */
export function isTextResource(r) {
  if (r.type) return r.type === 'text';
  return !isRemote(r.source);
}

/** 归一化目标路径用于「同一文件」判定（Windows 大小写不敏感） */
function normTarget(p) {
  return resolve(expandPath(p)).toLowerCase();
}

/**
 * 收集指向某入口文件的全部 text 资源内容（按 settings 资源定义顺序）。
 * @param {string} targetFile 入口文件路径（~ 写法或绝对路径均可）
 * @returns {{ present: {id, content}[], missing: {id, recoverable}[] }}
 */
export function collectPartsForTarget(targetFile) {
  const key = normTarget(targetFile);
  const present = [];
  const missing = [];
  for (const r of loadResources()) {
    if (!isTextResource(r)) continue;
    const targets = (r.targets || []).map(normTarget);
    if (!targets.includes(key)) continue;
    const srcFile = expandPath(r.source);
    if (!existsSync(srcFile)) {
      const recoverable = resolve(srcFile).toLowerCase().startsWith(resolve(KNOWLEDGE_DIR).toLowerCase());
      missing.push({ id: r.id, recoverable });
      continue;
    }
    present.push({ id: r.id, content: readSource(srcFile) });
  }
  return { present, missing };
}

/** 把多个资源内容拼成单一托管块内容（双空行分隔） */
export function joinParts(parts) {
  return parts.map((p) => p.content).join('\n\n');
}
