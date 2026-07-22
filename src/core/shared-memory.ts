/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * EvoKit — Shared Memory Layer
 *
 * Provides cross-adapter access to learning data in ~/.claude/memory/.
 * All adapters (Claude Code, Codex CLI, OpenCode, Pi CLI) share the same
 * canonical data store. Each session record is tagged by assistant name.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import {
  CorrectionEntry,
  ObservationEntry,
  SessionEntry,
  ViolationEntry,
  LearnedRule,
} from './types.js';

export const DEFAULT_MEMORY_DIR = '.claude/memory';
export type AssistantName = 'claude' | 'codex' | 'opencode' | 'pi';

// ─── Read Operations ──────────────────────────────────────────

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Resolve the shared memory directory path.
 */
export function getMemoryDir(homeDir: string, memoryDir?: string): string {
  return memoryDir ? path.resolve(memoryDir) : path.resolve(homeDir, DEFAULT_MEMORY_DIR);
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Read all corrections from corrections.jsonl.
 */
export function readCorrections(homeDir: string, memoryDir?: string): CorrectionEntry[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'corrections.jsonl');
  if (!fse.existsSync(filePath)) return [];
  return parseJsonl<CorrectionEntry>(filePath);
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Read all observations from observations.jsonl.
 */
export function readObservations(homeDir: string, memoryDir?: string): ObservationEntry[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'observations.jsonl');
  if (!fse.existsSync(filePath)) return [];
  return parseJsonl<ObservationEntry>(filePath);
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Read session records from sessions.jsonl, optionally filtered by assistant.
 */
export function readSessions(
  homeDir: string,
  options?: { assistant?: AssistantName; memoryDir?: string },
): SessionEntry[] {
  const filePath = path.join(getMemoryDir(homeDir, options?.memoryDir), 'sessions.jsonl');
  if (!fse.existsSync(filePath)) return [];
  const all = parseJsonl<SessionEntry>(filePath);
  if (options?.assistant) {
    return all.filter((s) => s.assistant === options.assistant);
  }
  return all;
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Read learned-rules.md and parse its rules.
 */
export function readLearnedRules(homeDir: string, memoryDir?: string): LearnedRule[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'learned-rules.md');
  if (!fse.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const rules: LearnedRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match lines like: "- Rule description <!-- verify: command -->"
    const match = line.match(/^-\s+(.+?)(?:\s+<!--\s*verify:\s*(.+?)\s*-->)?\s*$/);
    if (match) {
      rules.push({
        description: match[1].trim(),
        verify: match[2]?.trim(),
      });
    }
  }

  return rules;
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Read violations from violations.jsonl.
 */
export function readViolations(homeDir: string, memoryDir?: string): ViolationEntry[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'violations.jsonl');
  if (!fse.existsSync(filePath)) return [];
  return parseJsonl<ViolationEntry>(filePath);
}

// ─── Write Operations ─────────────────────────────────────────

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Append a correction entry (append-only).
 */
export function appendCorrection(
  homeDir: string,
  entry: Omit<CorrectionEntry, 'timestamp' | 'count'>,
  memoryDir?: string,
): void {
  const memDir = getMemoryDir(homeDir, memoryDir);
  fse.ensureDirSync(memDir);

  const filePath = path.join(memDir, 'corrections.jsonl');
  const fullEntry: CorrectionEntry = {
    timestamp: new Date().toISOString(),
    count: 1,
    ...entry,
  };

  appendJsonl(filePath, fullEntry);
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Append an observation entry (append-only).
 */
export function appendObservation(
  homeDir: string,
  entry: Omit<ObservationEntry, 'timestamp'>,
  memoryDir?: string,
): void {
  const memDir = getMemoryDir(homeDir, memoryDir);
  fse.ensureDirSync(memDir);

  const filePath = path.join(memDir, 'observations.jsonl');
  const fullEntry: ObservationEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  appendJsonl(filePath, fullEntry);
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Record a session entry tagged by assistant name.
 */
export function recordSession(
  homeDir: string,
  entry: Omit<SessionEntry, 'timestamp'> & { assistant: AssistantName },
  memoryDir?: string,
): void {
  const memDir = getMemoryDir(homeDir, memoryDir);
  fse.ensureDirSync(memDir);

  const filePath = path.join(memDir, 'sessions.jsonl');
  const fullEntry: SessionEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  appendJsonl(filePath, fullEntry);
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Append a violation entry.
 */
export function appendViolation(
  homeDir: string,
  entry: Omit<ViolationEntry, 'timestamp'>,
  memoryDir?: string,
): void {
  const memDir = getMemoryDir(homeDir, memoryDir);
  fse.ensureDirSync(memDir);

  const filePath = path.join(memDir, 'violations.jsonl');
  const fullEntry: ViolationEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  appendJsonl(filePath, fullEntry);
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Parse a JSONL file into an array of typed objects.
 */
function parseJsonl<T>(filePath: string): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l) as T;
      } catch {
        return null;
      }
    })
    .filter((v): v is T => v !== null);
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Append a JSONL entry to a file with secure permissions.
 */
function appendJsonl(filePath: string, entry: unknown): void {
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  // Secure the file after write
  try {
    const stats = fs.statSync(filePath);
    if (stats.mode & 0o077) {
      fs.chmodSync(filePath, 0o600);
    }
  } catch {
    // Best-effort: if file doesn't exist yet, chmod will fail — that's fine
  }
}
