import fs from 'node:fs';
import path from 'node:path';

/**
 * @internal — JSONL/内存工具。
 * 不属于公共适配器 API。
 */

// ─── JSONL 操作 ───────────────────────────────────────────

export function readJsonlFile<T>(filePath: string): T[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    return lines
      .map((line, i) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          console.warn(`警告: ${filePath} 第 ${i + 1} 行 JSONL 格式错误`);
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

// ─── 演化日志 ──────────────────────────────────────────────

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

// ─── 工具函数 ──────────────────────────────────────────────

export function getFileLineCount(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content === '') return 0;
    const lines = content.split('\n');
    // 去除文件末尾换行符产生的空行
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

/** 适配器 ID → memory 子路径映射 */
const ADAPTER_MEMORY_PATHS: Record<string, string> = {
  claude: '.claude/memory',
  codex: '.codex/memory',
  opencode: '.config/opencode/memory',
  pi: '.pi/agent/memory',
};

/**
 * 获取指定适配器的 memory 目录路径。
 * @param homeDir 用户家目录
 * @param adapterId 适配器 ID（默认 'claude'）
 */
export function getMemoryDir(homeDir: string, adapterId = 'claude'): string {
  const subPath = ADAPTER_MEMORY_PATHS[adapterId] ?? ADAPTER_MEMORY_PATHS['claude'];
  return path.join(homeDir, subPath);
}

/**
 * 获取指定适配器的 archive 目录路径。
 * @param homeDir 用户家目录
 * @param adapterId 适配器 ID（默认 'claude'）
 */
export function getArchiveDir(homeDir: string, adapterId = 'claude'): string {
  const dir = path.join(getMemoryDir(homeDir, adapterId), 'archive');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 将 ISO 时间戳字符串转换为 Date；输入无效时返回 null */
export function parseTimestamp(ts: string): Date | null {
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** 检查时间戳是否距今超过 N 天 */
export function isOlderThanDays(ts: string, days: number): boolean {
  const date = parseTimestamp(ts);
  if (!date) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() < cutoff;
}
