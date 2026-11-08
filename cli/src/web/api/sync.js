// web API：三入口同步状态（纯数据函数）
// 一致性口径与 evokit check 完全一致：期望块 = 指向该入口的全部 text 资源合并内容（trim 后全等）
// status：missing = 入口文件不存在或无托管块；drifted = 有块但与期望不一致；consistent = 一致

import { existsSync, readFileSync, statSync } from 'node:fs';
import { BEGIN, END, expandPath } from '../../paths.js';
import { loadAgents } from '../../config.js';
import { collectPartsForTarget, joinParts } from '../../entry-content.js';

/** 三入口同步状态明细（契约 §8.7） */
export function syncEntries() {
  const agents = loadAgents();
  return agents.map((agent) => {
    const file = expandPath(agent.global);
    let status = 'missing';
    let lastSyncAt = null;
    if (existsSync(file)) {
      try {
        lastSyncAt = statSync(file).mtime.toISOString();
      } catch { /* mtime 读不到则保持 null */ }
      try {
        const content = readFileSync(file, 'utf-8');
        if (content.includes(BEGIN) && content.includes(END)) {
          const managed = content.slice(content.indexOf(BEGIN) + BEGIN.length, content.indexOf(END)).trim();
          const expected = joinParts(collectPartsForTarget(file).present).trim();
          status = managed === expected ? 'consistent' : 'drifted';
        }
      } catch { /* 读失败按缺失处理 */ }
    }
    return { id: agent.id, name: agent.name, file, status, lastSyncAt };
  });
}

/** 三态计数（总览页摘要用） */
export function syncSummary() {
  const counts = { consistent: 0, drifted: 0, missing: 0 };
  for (const entry of syncEntries()) counts[entry.status] += 1;
  return counts;
}
