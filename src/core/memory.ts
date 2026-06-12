import fs from 'node:fs';
import path from 'node:path';
import { LearnedRule, CorrectionEntry, ObservationEntry, SessionEntry, ViolationEntry } from './types.js';

// ─── JSONL Operations ───────────────────────────────────────────

export function readJsonlFile<T>(filePath: string): T[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    return lines
      .map((line, i) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          console.warn(`Warning: malformed JSONL entry at line ${i + 1} in ${filePath}`);
          return null;
        }
      })
      .filter(Boolean) as T[];
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export function appendToJsonl<T>(filePath: string, entry: T): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}

export function writeJsonlFile<T>(filePath: string, entries: T[]): void {
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── Learned Rules (.md) ────────────────────────────────────────

const RULE_REGEX = /^- \*\*(.+?)\*\*(?:\s*\(deprecated\))?\s*$/m;
const VERIFY_REGEX = /<!--\s*verify:\s*(.+?)\s*-->/;
const PROMOTED_REGEX = /<!--\s*promoted:\s*(.+?)\s*-->/;

export function readLearnedRules(filePath: string): LearnedRule[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const rules: LearnedRule[] = [];
    let current: Partial<LearnedRule> | null = null;

    for (const line of lines) {
      const ruleMatch = line.match(RULE_REGEX);
      if (ruleMatch) {
        if (current?.description) {
          rules.push(current as LearnedRule);
        }
        current = {
          description: ruleMatch[1],
          deprecated: line.includes('(deprecated)'),
        };
        continue;
      }
      if (current) {
        const verifyMatch = line.match(VERIFY_REGEX);
        if (verifyMatch) {
          current.verify = verifyMatch[1].trim();
        }
        const promotedMatch = line.match(PROMOTED_REGEX);
        if (promotedMatch) {
          current.promoted = promotedMatch[1].trim();
        }
      }
    }
    if (current?.description) {
      rules.push(current as LearnedRule);
    }
    return rules;
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export function writeLearnedRules(filePath: string, rules: LearnedRule[]): void {
  const lines: string[] = [
    '# Learned Rules',
    '',
    'Rules promoted from corrections and observations. Run `/evolve` to audit.',
    '',
  ];
  for (const rule of rules) {
    const depLabel = rule.deprecated ? ' (deprecated)' : '';
    lines.push(`- **${rule.description}**${depLabel}`);
    if (rule.verify) lines.push(`  <!-- verify: ${rule.verify} -->`);
    if (rule.promoted) lines.push(`  <!-- promoted: ${rule.promoted} -->`);
    lines.push('');
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

// ─── Evolution Log ──────────────────────────────────────────────

export function readEvolutionLog(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(Boolean);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export function appendToEvolutionLog(filePath: string, entry: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  fs.appendFileSync(filePath, `[${timestamp}] ${entry}\n`, 'utf-8');
}

// ─── Utilities ──────────────────────────────────────────────────

export function getFileLineCount(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content === '') return 0;
    const lines = content.split('\n');
    // Trim trailing empty line from files ending with newline
    if (lines[lines.length - 1] === '') lines.pop();
    return lines.length;
  } catch (err: any) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

export function getClaudeDir(homeDir: string): string {
  return path.join(homeDir, '.claude');
}

export function getMemoryDir(homeDir: string): string {
  return path.join(homeDir, '.claude', 'memory');
}

export function getArchiveDir(homeDir: string): string {
  const dir = path.join(homeDir, '.claude', 'memory', 'archive');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Converts an ISO timestamp string to Date; returns null on invalid input */
export function parseTimestamp(ts: string): Date | null {
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Check if a timestamp is older than N days from now */
export function isOlderThanDays(ts: string, days: number): boolean {
  const date = parseTimestamp(ts);
  if (!date) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() < cutoff;
}
