// 路径常量与跨平台路径展开

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// 允许通过 EVOKIT_HOME 覆盖家目录（测试/隔离用）；默认 ~
export const HOME = process.env.EVOKIT_HOME || homedir();
export const EVOKIT_DIR = join(HOME, '.evokit');
export const GLOBAL_SOURCE = join(EVOKIT_DIR, 'context.md');
// 统一配置文件：agents + resources + prompts 三块合流（settings.json）
export const CONFIG_FILE = join(EVOKIT_DIR, 'settings.json');

// ── 记忆引擎（v3）路径：知识根 / inbox / 水位线 / 触发队列（ADR 0009）──
export const KNOWLEDGE_DIR = join(EVOKIT_DIR, 'knowledge');
export const KNOWLEDGE_INDEX_FILE = join(KNOWLEDGE_DIR, 'knowledge-index.md');
export const PENDING_DIR = join(KNOWLEDGE_DIR, '.pending');
export const ORPHAN_DIR = join(PENDING_DIR, 'orphan');
export const REJECTED_DIR = join(KNOWLEDGE_DIR, '.rejected');
export const ARCHIVE_DIR = join(KNOWLEDGE_DIR, '.archive');
export const REFERENCES_FILE = join(KNOWLEDGE_DIR, 'references.jsonl');
export const INBOX_DIR = join(EVOKIT_DIR, 'inbox');
export const STATE_FILE = join(EVOKIT_DIR, 'state.json');
export const TRIGGERS_DIR = join(EVOKIT_DIR, 'triggers');
// 技能源仓库（forge 产出与 symlink 分发的落点）
export const AGENTS_SKILLS_DIR = join(HOME, '.agents', 'skills');

// 托管块边界标记
export const BEGIN = '<!-- evokit-managed:start -->';
export const END = '<!-- evokit-managed:end -->';

/**
 * 展开配置路径（跨平台）：
 *   1. 归一化反斜杠 \ → /（Windows 用户手写路径习惯）
 *   2. 展开环境变量：%VAR%（Windows）和 $VAR / ${VAR}（三平台通用）
 *   3. 展开 ~ 为真实 HOME（兼容 ~ 与 ~\ 两种写法）
 *   4. 最后 path.resolve 统一规范化（含盘符的绝对路径原样保留，其余转为平台标准形式）
 */
export function expandPath(p) {
  if (typeof p !== 'string' || p === '') return p;
  // 1. 归一化反斜杠
  let s = p.replace(/\\/g, '/');
  // 2. 展开环境变量（%VAR% 和 ${VAR} 和 $VAR）
  s = s.replace(/%([A-Za-z_][A-Za-z0-9_]*)%|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (m, win, braced, bare) => {
      const name = win || braced || bare;
      const v = process.env[name];
      return v !== undefined && v !== '' ? v : m; // 未定义则保留原文，便于排错
    });
  // 3. 展开 ~
  if (s === '~') s = HOME;
  else if (s.startsWith('~/')) s = join(HOME, s.slice(2));
  // 4. 统一规范化为平台标准形式
  return resolve(s);
}
