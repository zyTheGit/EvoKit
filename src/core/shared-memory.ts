/**
 *
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * EvoKit — 共享内存层
 *
 * 提供跨适配器访问 ~/.claude/memory/ 中的学习数据。
 * 所有适配器（Claude Code、Codex CLI、OpenCode、Pi CLI）共享同一个
 * 规范化数据存储。每条会话记录按助手名称标记。
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

// ─── 读取操作 ──────────────────────────────────────────

/**
 *
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 解析共享内存目录路径。
 */
export function getMemoryDir(homeDir: string, memoryDir?: string): string {
  return memoryDir ? path.resolve(memoryDir) : path.resolve(homeDir, DEFAULT_MEMORY_DIR);
}

/**
 *
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 从 corrections.jsonl 读取所有修正记录。
 */
export function readCorrections(homeDir: string, memoryDir?: string): CorrectionEntry[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'corrections.jsonl');
  if (!fse.existsSync(filePath)) return [];
  return parseJsonl<CorrectionEntry>(filePath);
}

/**
 *
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 从 observations.jsonl 读取所有观察记录。
 */
export function readObservations(homeDir: string, memoryDir?: string): ObservationEntry[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'observations.jsonl');
  if (!fse.existsSync(filePath)) return [];
  return parseJsonl<ObservationEntry>(filePath);
}

/**
 *
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 从 sessions.jsonl 读取会话记录，可按助手名称过滤。
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
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 读取 learned-rules.md 并解析规则。
 */
export function readLearnedRules(homeDir: string, memoryDir?: string): LearnedRule[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'learned-rules.md');
  if (!fse.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const rules: LearnedRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // 匹配形如: "- Rule description <!-- verify: command -->" 的行
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
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 从 violations.jsonl 读取违规记录。
 */
export function readViolations(homeDir: string, memoryDir?: string): ViolationEntry[] {
  const filePath = path.join(getMemoryDir(homeDir, memoryDir), 'violations.jsonl');
  if (!fse.existsSync(filePath)) return [];
  return parseJsonl<ViolationEntry>(filePath);
}

// ─── 写入操作 ─────────────────────────────────────────

/**
 *
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 追加修正记录（仅追加）。
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
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 追加观察记录（仅追加）。
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
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 按助手名称记录会话记录。
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
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 追加违规记录。
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

// ─── 辅助函数 ──────────────────────────────────────────────────

/**
 *
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 将 JSONL 文件解析为类型化对象数组。
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
 * @internal — 内部辅助函数，不属于公开适配器 API。
 * 将 JSONL 记录以安全权限追加到文件。
 */
function appendJsonl(filePath: string, entry: unknown): void {
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  // 写入后设置安全权限
  try {
    const stats = fs.statSync(filePath);
    if (stats.mode & 0o077) {
      fs.chmodSync(filePath, 0o600);
    }
  } catch {
    // 最佳努力：如果文件不存在，chmod 会失败 — 没关系
  }
}
