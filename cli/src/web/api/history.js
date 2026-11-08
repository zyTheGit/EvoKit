// web API：知识根 git 历史（纯数据函数；git.js 负责子进程与降级）

import { KNOWLEDGE_DIR, PENDING_DIR, ARCHIVE_DIR, REJECTED_DIR } from '../../paths.js';
import { readCardById, listCards } from '../../knowledge-cards.js';
import { logAll, logFollow } from '../git.js';

/** 跨四区解析卡片在知识根下的相对文件路径（'/' 分隔）；找不到返回 null */
function findCardRelFile(id) {
  if (!id || /[\\/]/.test(id) || id.includes('..')) return null;
  if (readCardById(KNOWLEDGE_DIR, id)) return `${id}.md`;
  for (const dir of [PENDING_DIR, ARCHIVE_DIR, REJECTED_DIR]) {
    const found = listCards(dir).find((c) => c.id === id);
    if (found) return found.file;
  }
  return null;
}

/** GET /api/history：知识根提交时间线 */
export function historyAll() {
  return logAll(KNOWLEDGE_DIR);
}

/** GET /api/history/:id：单卡历史（--follow）；id 不存在 → commits 空数组 */
export function historyCard(id) {
  const relFile = findCardRelFile(id);
  if (!relFile) {
    return { available: logAll(KNOWLEDGE_DIR).available, commits: [] };
  }
  return logFollow(KNOWLEDGE_DIR, relFile);
}
