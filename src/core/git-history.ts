/**
 * @internal — Git 历史提取器（source=git-history，ADR 0004）。
 *
 * 确定性启发式，严格遵循 `docs/research/git-history-heuristics.md`：
 * - **结构匹配率门控**：排除非约定 subject 后，命中有 type 前缀的占比 ≥ 0.7 且样本 ≥ 20 才提取
 *   （"漏提优于误提"——匹配率不足视为混沌历史，噪声支配，不提示）。
 * - **type 词包抽取**：聚合出现 ≥ 2 次的 type 前缀作为约定细节。
 * - **排除清单**：merge / revert / release / 版本号 bump / 含敏感信息。
 * - **产物是候选线索**（pattern + 建议 type + 支撑样本 + 匹配率），非成型条目；
 *   由 `evokit learn --git-history` 生成到 `.pending/`，复用确认闸门人工背书，
 *   不新增写入通道（ADR 0004）。
 */

import { execFileSync } from 'node:child_process';
import type { KnowledgeType } from './types.js';

/** 单条 Git 历史候选线索（未背书，进 .pending/ 待确认）。 */
export interface GitHistoryCandidate {
  /** 结构匹配 pattern 描述，如 "commit message 使用 Conventional Commits 格式（feat/fix: <subject>）" */
  pattern: string;
  /** 建议知识类型（git-history 只提出 convention/workflow 候选，ADR 0004） */
  type: Extract<KnowledgeType, 'workflow' | 'convention'>;
  /** 结构匹配率（命中 type 前缀的 subject 占比，0–1） */
  matchRate: number;
  /** 参与判定的样本总数（排除 merge/revert/release 等之后） */
  sampleCount: number;
  /** 支撑样本（命中 type 前缀的 subject 示例，最多 5 条） */
  samples: string[];
}

/** 采样上限：最近 N 条 commit subject（research §3.1，建议上限防超大仓库开销）。 */
export const GIT_SAMPLE_LIMIT = 60;

/** 结构匹配率门控：≥ 此值才提取（research §3.1；0.3–0.7 弱信号降级为不提取）。 */
export const MATCH_RATE_THRESHOLD = 0.7;

/** 参与判定的最小样本数（小样本下任何比率都不可信，research §3.1）。 */
export const MIN_SAMPLE_COUNT = 20;

/** 命中即计为"结构匹配"的 type 前缀正则（含可选 scope）：`feat: ` / `feat(scope): `。 */
const TYPE_PREFIX_RE = /^([a-z][a-z0-9-]*)(?:\([^)]*\))?: /;

/** 排除类 subject 正则（research §3.3）：merge / revert / release / 版本号 bump（含中英发版形态）。 */
const EXCLUDED_SUBJECT_RE =
  /^(Merge|Revert|release|publish|Bump version|Bump |chore\(release\)|chore: release|chore: 发布|chore: 发版|v?\d+\.\d+\.\d+)/i;

/** 含敏感信息（令牌/路径/密钥）的 subject 正则（research §3.3 安全红线）。 */
const SENSITIVE_SUBJECT_RE =
  /(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{16,}|api[_-]?key|password|secret|private key|BEGIN .*PRIVATE KEY|\/home\/)/i;

/** subject 是否应排除（不计入样本，research §3.3 排除清单）。 */
export function isExcludedSubject(subject: string): boolean {
  return EXCLUDED_SUBJECT_RE.test(subject) || SENSITIVE_SUBJECT_RE.test(subject);
}

/** 读取最近 GIT_SAMPLE_LIMIT 条 commit subject；非 git 仓库或 git 不可用时返回空数组。 */
export function readRecentCommitSubjects(cwd: string): string[] {
  try {
    const out = execFileSync('git', ['log', `-${GIT_SAMPLE_LIMIT}`, '--pretty=%s'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 对 commit subject 数组执行确定性启发式分类（纯函数，可测试）。
 *
 * 门控顺序：排除非约定 subject → 样本数 ≥ MIN_SAMPLE_COUNT → 匹配率 ≥ MATCH_RATE_THRESHOLD。
 * 全部通过才产出候选（结构稳定才值得提出"commit 使用 XX 约定"）。
 *
 * @param subjects commit subject 数组（每元素一条）
 * @returns 候选线索数组；不满足门控时返回空数组。
 */
export function classifyGitSubjects(subjects: string[]): GitHistoryCandidate[] {
  const filtered = subjects
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isExcludedSubject(s));
  if (filtered.length < MIN_SAMPLE_COUNT) return [];

  const matched = filtered.filter((s) => TYPE_PREFIX_RE.test(s));
  const matchRate = matched.length / filtered.length;
  if (matchRate < MATCH_RATE_THRESHOLD) return [];

  // type 词包抽取（research §3.2）：出现 ≥ 2 次的 type 前缀，按频次降序取前 5
  const typeCounts = new Map<string, number>();
  for (const s of matched) {
    const m = s.match(TYPE_PREFIX_RE);
    if (m) typeCounts.set(m[1], (typeCounts.get(m[1]) ?? 0) + 1);
  }
  const topTypes = [...typeCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  const typeDesc = topTypes.length > 0 ? topTypes.join('/') : 'type';

  return [
    {
      pattern: `commit message 使用 Conventional Commits 格式（${typeDesc}: <subject>）`,
      type: 'workflow',
      matchRate,
      sampleCount: filtered.length,
      samples: matched.slice(0, 5),
    },
  ];
}

/**
 * 从指定目录的 Git 历史提取候选线索（ADR 0004 入口）。
 *
 * @param cwd git 仓库目录
 * @returns 候选线索数组；非仓库 / 样本不足 / 匹配率不足时返回空数组。
 */
export function extractGitHistoryCandidates(cwd: string): GitHistoryCandidate[] {
  return classifyGitSubjects(readRecentCommitSubjects(cwd));
}
