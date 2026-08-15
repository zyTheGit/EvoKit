/**
 * @internal — 知识库健康诊断（ADR 0003，ROADMAP v1.1）。
 *
 * 对单个规范知识根（canonical root：个人 `~/.evokit/knowledge/`、项目 `<project>/.evokit/`）
 * 输出量化健康报告，供 `evokit doctor` / `evokit boot` 表面化该被关注的问题：
 *
 * - **双向索引漂移**：`knowledge/` 有条目但索引未引用（孤儿 orphan）/ 索引引用但条目缺失（悬空 dangling）。
 * - **frontmatter 合法性**：必填字段或 confidence 三档校验失败（复用 readKnowledgeEntry）。
 * - **积压**：`.pending/` 待确认数、STALE/RETIRED 待复审数。
 * - **分布**：按 scope / type / confidence 统计。
 *
 * 降档/复审仍由人工/AI 二分判断驱动；本层只"表面化"，不自动改档（ADR 0003）。
 */

import path from 'node:path';
import { KnowledgeRepository } from './repository.js';
import { readKnowledgeEntry, readKnowledgeIndex, KnowledgeConfidence } from './knowledge.js';
import type { KnowledgeEntry } from './types.js';

/** 单个规范知识根的健康报告。 */
export interface KnowledgeHealthReport {
  /** 规范知识根路径 */
  root: string;
  /** 已入库条目数（frontmatter 合法） */
  activeCount: number;
  /** 待确认草稿数（.pending/） */
  pendingCount: number;
  /** STALE(0.5) 待复审条数 */
  staleCount: number;
  /** RETIRED(0.1) 疑失效条数 */
  retiredCount: number;
  /** knowledge/ 有但索引未引用的条目（孤儿） */
  orphanEntries: string[];
  /** 索引引用但 knowledge/ 缺失的条目（悬空） */
  danglingEntries: string[];
  /** frontmatter 校验失败（必填字段缺失 / confidence 非三档）的条目 */
  invalidEntries: string[];
  /** 按 scope / type / confidence 的条目分布（仅统计合法条目） */
  distribution: {
    scope: Record<string, number>;
    type: Record<string, number>;
    confidence: Record<string, number>;
  };
}

/** 从索引行解析条目 id；非条目行返回 undefined。 */
function idFromIndexLine(line: string): string | undefined {
  const m = line.match(/^- \[([^\]]+)\]/);
  return m ? m[1] : undefined;
}

function countBy(
  entries: KnowledgeEntry[],
  key: (e: KnowledgeEntry) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const k = key(e);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * 对单个规范知识根执行健康诊断（只读，不修改任何文件）。
 *
 * @param root 规范知识根路径
 * @returns 健康报告；根不存在时返回全空报告（0 条目、无漂移）。
 */
export function inspectKnowledgeHealth(root: string): KnowledgeHealthReport {
  const repo = new KnowledgeRepository({ knowledgeRoot: root });
  const { evokit, claude } = readKnowledgeIndex(repo.indexPath);
  const indexedIds = [...evokit, ...claude]
    .map(idFromIndexLine)
    .filter((id): id is string => Boolean(id));

  const activeIds = repo.listActive();
  const valid = activeIds
    .map((id) => repo.getActive(id))
    .filter((e): e is KnowledgeEntry => e !== null);

  const orphanEntries = activeIds.filter((id) => !indexedIds.includes(id));
  const danglingEntries = indexedIds.filter((id) => !activeIds.includes(id));
  const invalidEntries = activeIds.filter((id) => {
    const filePath = path.join(repo.knowledgeDir, `${id}.md`);
    return !readKnowledgeEntry(filePath);
  });

  return {
    root,
    activeCount: valid.length,
    pendingCount: repo.listPending().length,
    staleCount: valid.filter((e) => e.confidence === KnowledgeConfidence.STALE).length,
    retiredCount: valid.filter((e) => e.confidence === KnowledgeConfidence.RETIRED).length,
    orphanEntries,
    danglingEntries,
    invalidEntries,
    distribution: {
      scope: countBy(valid, (e) => e.scope),
      type: countBy(valid, (e) => e.type),
      confidence: countBy(valid, (e) => String(e.confidence)),
    },
  };
}
