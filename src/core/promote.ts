/**
 * @internal — 演化管道的纠正分析和规则提升逻辑。
 * 不属于公共适配器 API。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  EvoConfig,
  CorrectionEntry,
  CorrectionGroup,
  LearnedRule,
  PromotionResult,
  SessionEntry,
} from './types.js';
import {
  readJsonlFile,
  writeJsonlFile,
  readLearnedRules,
  writeLearnedRules,
  appendToEvolutionLog,
  getMemoryDir,
} from './memory.js';

// ─── 纠正分析 ────────────────────────────────────────────

export function analyzeCorrections(config: EvoConfig): CorrectionGroup[] {
  const memoryDir = getMemoryDir(config.homeDir, config.adapterId);
  const corrections = readJsonlFile<CorrectionEntry>(path.join(memoryDir, 'corrections.jsonl'));

  const grouped = new Map<string, CorrectionEntry[]>();
  for (const entry of corrections) {
    const existing = grouped.get(entry.pattern) || [];
    existing.push(entry);
    grouped.set(entry.pattern, existing);
  }

  const result: CorrectionGroup[] = [];
  for (const [pattern, entries] of grouped) {
    result.push({ pattern, entries, count: entries.length });
  }

  result.sort((a, b) => b.count - a.count);
  return result;
}

// ─── 提升 ──────────────────────────────────────────────

export function promotePatterns(config: EvoConfig, groups: CorrectionGroup[]): PromotionResult[] {
  const memoryDir = getMemoryDir(config.homeDir, config.adapterId);
  const rulesPath = path.join(memoryDir, 'learned-rules.md');
  const logPath = path.join(memoryDir, 'evolution-log.md');
  const threshold = config.promoteThreshold ?? 2;

  const existingRules = readLearnedRules(rulesPath);
  const existingPatterns = new Set(existingRules.map((r) => r.description.toLowerCase().trim()));

  // 读取演化日志中之前被拒绝的模式
  const logContent = readEvolutionLogFromPath(logPath);
  const rejectedPatterns = extractRejectedPatterns(logContent);
  const results: PromotionResult[] = [];
  const newRules: LearnedRule[] = [];

  for (const group of groups) {
    const patternLower = group.pattern.toLowerCase().trim();

    // 检查是否已作为规则存在
    if (existingPatterns.has(patternLower)) {
      results.push({
        pattern: group.pattern,
        decision: 'rejected',
        count: group.count,
        reason: '已存在于 learned-rules.md 中',
      });
      continue;
    }

    // 检查是否之前被拒绝过
    if (rejectedPatterns.has(patternLower)) {
      results.push({
        pattern: group.pattern,
        decision: 'rejected',
        count: group.count,
        reason: '之前已被拒绝（参见 evolution-log.md）',
      });
      continue;
    }

    // 检查阈值
    if (group.count >= threshold) {
      const verifyLine = generateVerifyLine(group.pattern);
      const today = new Date().toISOString().slice(0, 10);
      newRules.push({
        description: group.pattern,
        verify: verifyLine,
        promoted: today,
      });
      results.push({
        pattern: group.pattern,
        decision: 'promoted',
        count: group.count,
        reason: `模式出现了 ${group.count} 次（阈值: ${threshold}）`,
      });
    } else {
      results.push({
        pattern: group.pattern,
        decision: 'deferred',
        count: group.count,
        reason: `仅出现 ${group.count} 次（阈值: ${threshold}）`,
      });
    }
  }

  // 将新规则追加到 learned-rules.md
  if (newRules.length > 0 && !config.dryRun) {
    const allRules = [...existingRules, ...newRules];
    writeLearnedRules(rulesPath, allRules);
  }

  return results;
}

// ─── 过期规则修剪 ─────────────────────────────────────────

export function pruneStaleRules(config: EvoConfig, sessions: SessionEntry[]): PromotionResult[] {
  const memoryDir = getMemoryDir(config.homeDir, config.adapterId);
  const rulesPath = path.join(memoryDir, 'learned-rules.md');
  const logPath = path.join(memoryDir, 'evolution-log.md');
  const graduateThreshold = config.graduateSessions ?? 10;

  const rules = readLearnedRules(rulesPath);
  const results: PromotionResult[] = [];

  if (rules.length === 0) return results;

  const kept: LearnedRule[] = [];

  for (const rule of rules) {
    if (rule.deprecated) {
      // 已标记为废弃，保留标记
      kept.push(rule);
      continue;
    }

    if (rule.promoted && sessions.length >= graduateThreshold) {
      const promotedDate = new Date(rule.promoted).getTime();
      const sessionCountSince = sessions.filter((s) => {
        const sessionDate = new Date(s.timestamp).getTime();
        return sessionDate > promotedDate;
      }).length;

      if (sessionCountSince >= graduateThreshold && !config.dryRun) {
        // 规则已验证足够次数——可以毕业，但目前仅标记为活跃
        kept.push(rule);
        continue;
      }

      if (sessionCountSince < Math.floor(graduateThreshold / 2)) {
        // 验证次数不足——标记为废弃
        if (!config.dryRun) {
          kept.push({ ...rule, deprecated: true });
        }
        results.push({
          pattern: rule.description,
          decision: 'pruned',
          count: 0,
          reason: `规则活跃期间仅有 ${sessionCountSince} 个会话（需要 ${graduateThreshold}）`,
        });
        continue;
      }
    }

    kept.push(rule);
  }

  if (!config.dryRun && kept.length !== rules.length) {
    writeLearnedRules(rulesPath, kept);
  }

  return results;
}

// ─── 日志记录 ────────────────────────────────────────────

export function logDecisions(config: EvoConfig, results: PromotionResult[]): void {
  if (config.dryRun) return;
  const logPath = path.join(getMemoryDir(config.homeDir, config.adapterId), 'evolution-log.md');

  for (const r of results) {
    const emoji =
      r.decision === 'promoted'
        ? '⬆️'
        : r.decision === 'pruned'
          ? '🗑️'
          : r.decision === 'rejected'
            ? '⏭️'
            : '⏸️';
    appendToEvolutionLog(
      logPath,
      `${emoji} ${r.decision}: "${r.pattern}" (count=${r.count}) — ${r.reason}`,
    );
  }
}

export function prunePromotedCorrections(config: EvoConfig, results: PromotionResult[]): void {
  if (config.dryRun) return;

  const memoryDir = getMemoryDir(config.homeDir, config.adapterId);
  const correctionsPath = path.join(memoryDir, 'corrections.jsonl');

  const promoted = new Set(
    results.filter((r) => r.decision === 'promoted').map((r) => r.pattern.toLowerCase().trim()),
  );
  if (promoted.size === 0) return;

  const corrections = readJsonlFile<CorrectionEntry>(correctionsPath);
  const remaining = corrections.filter((c) => !promoted.has(c.pattern.toLowerCase().trim()));
  writeJsonlFile(correctionsPath, remaining);
}

// ─── 辅助函数 ────────────────────────────────────────────

function readEvolutionLogFromPath(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function extractRejectedPatterns(logLines: string[]): Set<string> {
  const rejected = new Set<string>();
  for (const line of logLines) {
    // 匹配模式如: ⏭️ rejected: "pattern text"
    const match = line.match(/(?:⏭️|rejected):\s*"(.+?)"/);
    if (match) {
      rejected.add(match[1].toLowerCase().trim());
    }
  }
  return rejected;
}

/**
 * 根据模式描述启发式生成验证行。
 * 生成简单的基于 grep 的检查，可由用户进一步修改。
 */
export function generateVerifyLine(pattern: string): string {
  // 提取关键词（名词、动词、工具）
  const keywords = pattern
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['always', 'before', 'after', 'should', 'never'].includes(w));

  if (keywords.length === 0) {
    return `echo "验证: ${pattern} — 无可用自动检查"`;
  }

  // 尝试生成有意义的检查
  const toolKeywords = keywords.filter((w) =>
    [
      'npm',
      'yarn',
      'pnpm',
      'uv',
      'pip',
      'fnm',
      'node',
      'python',
      'git',
      'docker',
      'make',
      'npx',
    ].includes(w),
  );

  if (toolKeywords.length > 0) {
    return `grep -r --include='*.sh' --include='*.md' '${toolKeywords[0]}' ~/.claude/ | head -5 || echo "未找到 ${toolKeywords[0]} 引用"`;
  }

  return `echo "验证: ${pattern}"`;
}
