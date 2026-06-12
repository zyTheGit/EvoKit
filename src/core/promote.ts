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

// ─── Correction Analysis ────────────────────────────────────────

export function analyzeCorrections(config: EvoConfig): CorrectionGroup[] {
  const memoryDir = getMemoryDir(config.homeDir);
  const corrections = readJsonlFile<CorrectionEntry>(
    path.join(memoryDir, 'corrections.jsonl'),
  );

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

// ─── Promotion ──────────────────────────────────────────────────

export function promotePatterns(
  config: EvoConfig,
  groups: CorrectionGroup[],
): PromotionResult[] {
  const memoryDir = getMemoryDir(config.homeDir);
  const rulesPath = path.join(memoryDir, 'learned-rules.md');
  const logPath = path.join(memoryDir, 'evolution-log.md');
  const threshold = config.promoteThreshold ?? 2;

  const existingRules = readLearnedRules(rulesPath);
  const existingPatterns = new Set(
    existingRules.map((r) => r.description.toLowerCase().trim()),
  );

  // Read evolution log for previously rejected patterns
  const logContent = readEvolutionLogFromPath(logPath);
  const rejectedPatterns = extractRejectedPatterns(logContent);
  const results: PromotionResult[] = [];
  const newRules: LearnedRule[] = [];

  for (const group of groups) {
    const patternLower = group.pattern.toLowerCase().trim();

    // Check if already exists as a rule
    if (existingPatterns.has(patternLower)) {
      results.push({
        pattern: group.pattern,
        decision: 'rejected',
        count: group.count,
        reason: 'Already exists in learned-rules.md',
      });
      continue;
    }

    // Check if previously rejected
    if (rejectedPatterns.has(patternLower)) {
      results.push({
        pattern: group.pattern,
        decision: 'rejected',
        count: group.count,
        reason: 'Previously rejected (see evolution-log.md)',
      });
      continue;
    }

    // Check threshold
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
        reason: `Pattern appeared ${group.count} times (threshold: ${threshold})`,
      });
    } else {
      results.push({
        pattern: group.pattern,
        decision: 'deferred',
        count: group.count,
        reason: `Only ${group.count} occurrence(s) (threshold: ${threshold})`,
      });
    }
  }

  // Append new rules to learned-rules.md
  if (newRules.length > 0 && !config.dryRun) {
    const allRules = [...existingRules, ...newRules];
    writeLearnedRules(rulesPath, allRules);
  }

  return results;
}

// ─── Stale Rule Pruning ─────────────────────────────────────────

export function pruneStaleRules(
  config: EvoConfig,
  sessions: SessionEntry[],
): PromotionResult[] {
  const memoryDir = getMemoryDir(config.homeDir);
  const rulesPath = path.join(memoryDir, 'learned-rules.md');
  const logPath = path.join(memoryDir, 'evolution-log.md');
  const graduateThreshold = config.graduateSessions ?? 10;

  const rules = readLearnedRules(rulesPath);
  const results: PromotionResult[] = [];

  if (rules.length === 0) return results;

  const kept: LearnedRule[] = [];

  for (const rule of rules) {
    if (rule.deprecated) {
      // Already deprecated, keep it marked
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
        // Rule has been verified enough — could graduate, but for now just mark as active
        kept.push(rule);
        continue;
      }

      if (sessionCountSince < Math.floor(graduateThreshold / 2)) {
        // Not enough verification — mark deprecated
        if (!config.dryRun) {
          kept.push({ ...rule, deprecated: true });
        }
        results.push({
          pattern: rule.description,
          decision: 'pruned',
          count: 0,
          reason: `Only ${sessionCountSince} sessions with rule active (need ${graduateThreshold})`,
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

// ─── Logging ────────────────────────────────────────────────────

export function logDecisions(
  config: EvoConfig,
  results: PromotionResult[],
): void {
  if (config.dryRun) return;
  const logPath = path.join(getMemoryDir(config.homeDir), 'evolution-log.md');

  for (const r of results) {
    const emoji =
      r.decision === 'promoted' ? '⬆️' :
      r.decision === 'pruned' ? '🗑️' :
      r.decision === 'rejected' ? '⏭️' : '⏸️';
    appendToEvolutionLog(
      logPath,
      `${emoji} ${r.decision}: "${r.pattern}" (count=${r.count}) — ${r.reason}`,
    );
  }
}

export function prunePromotedCorrections(
  config: EvoConfig,
  results: PromotionResult[],
): void {
  if (config.dryRun) return;

  const memoryDir = getMemoryDir(config.homeDir);
  const correctionsPath = path.join(memoryDir, 'corrections.jsonl');

  const promoted = new Set(
    results
      .filter((r) => r.decision === 'promoted')
      .map((r) => r.pattern.toLowerCase().trim()),
  );
  if (promoted.size === 0) return;

  const corrections = readJsonlFile<CorrectionEntry>(correctionsPath);
  const remaining = corrections.filter(
    (c) => !promoted.has(c.pattern.toLowerCase().trim()),
  );
  writeJsonlFile(correctionsPath, remaining);
}

// ─── Helpers ────────────────────────────────────────────────────

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
    // Match patterns like: ⏭️ rejected: "pattern text"
    const match = line.match(/(?:⏭️|rejected):\s*"(.+?)"/);
    if (match) {
      rejected.add(match[1].toLowerCase().trim());
    }
  }
  return rejected;
}

/**
 * Heuristically generate a verify line from a pattern description.
 * This produces a simple grep-based check that can be refined by the user.
 */
export function generateVerifyLine(pattern: string): string {
  // Extract key terms (nouns, verbs, tools)
  const keywords = pattern
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['always', 'before', 'after', 'should', 'never'].includes(w));

  if (keywords.length === 0) {
    return `echo "Verify: ${pattern} — no automatic check available"`;
  }

  // Try to generate a meaningful check
  const toolKeywords = keywords.filter(
    (w) => ['npm', 'yarn', 'pnpm', 'uv', 'pip', 'fnm', 'node', 'python', 'git', 'docker', 'make', 'npx'].includes(w),
  );

  if (toolKeywords.length > 0) {
    return `grep -r --include='*.sh' --include='*.md' '${toolKeywords[0]}' ~/.claude/ | head -5 || echo "No ${toolKeywords[0]} references found"`;
  }

  return `echo "Verify: ${pattern}"`;
}
