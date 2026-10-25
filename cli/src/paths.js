// 路径常量与跨平台路径展开

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// 允许通过 EVOKIT_HOME 覆盖家目录（测试/隔离用）；默认 ~
export const HOME = process.env.EVOKIT_HOME || homedir();
export const EVOKIT_DIR = join(HOME, '.evokit');
export const GLOBAL_SOURCE = join(EVOKIT_DIR, 'context.md');
// 统一配置文件：agents + resources + prompts 三块合流（settings.json）
export const CONFIG_FILE = join(EVOKIT_DIR, 'settings.json');

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
