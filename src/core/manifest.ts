/**
 * EvoKit — 清单类型与操作
 *
 * 定义记录 EvoKit 安装内容的清单模式，
 * 通过反转每条记录的操作实现精确卸载。
 *
 * 清单位于 `~/.evokit/manifest.json` —— 纯管理元数据目录，
 * 与运行时安装目标（`~/.claude/`、`~/.codex/` 等）分离。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

// ─── 类型 ───────────────────────────────────────────────────

/** 由 EvoKit 创建的文件 */
export interface ManifestFileRecord {
  /** 已安装文件的绝对路径 */
  path: string;
  /** 安装方式: 'copy' | 'copy-dir' | 'copy-skills' | 'seed-memory' | 'merge-settings' | 'merge-agents' */
  source: string;
  /** 文件是全新创建还是追加到已有文件 */
  mode: 'created' | 'appended';
  /** 对于追加文件：用于标识追加段的标记字符串 */
  appendMarker?: string;
}

/** 被合并到 settings.json 的 hook 事件条目 */
export interface ManifestHookEntry {
  /** Hook 事件名（如 'SessionStart'、'PreToolUse'） */
  event: string;
  /** 完整的 matcher+hooks 条目（JSON 对象），用于精确匹配 */
  entry: Record<string, unknown>;
}

/** 被添加到 settings.json 的环境变量 */
export interface ManifestEnvEntry {
  key: string;
  value: string;
}

/** 被合并到代理 .md 文件的 frontmatter 键值对 */
export interface ManifestAgentFrontmatter {
  /** 代理文件名（如 'architect.md'） */
  file: string;
  /** EvoKit 添加到 frontmatter 的键值对 */
  fields: Record<string, string>;
}

/** 单个适配器的安装记录 */
export interface AdapterManifest {
  /** 适配器 ID（如 'claude'、'codex'、'opencode'） */
  adapterId: string;
  /** 安装时的适配器版本 */
  adapterVersion: string;
  /** 安装时间戳（ISO 8601） */
  installedAt: string;
  /** 安装时的主目录（用于路径解析） */
  homeDir: string;
  /** 安装时的项目目录（用于项目级适配器） */
  projectDir?: string;
  /** 适配器主目录（如 ~/.claude/、~/.codex/） */
  adapterHome: string;
  /** EvoKit 创建或追加的文件 */
  files: ManifestFileRecord[];
  /** EvoKit 创建的目录（相对于 adapterHome） */
  directories: string[];
  /** 合并到 settings.json 的 hook 条目（Claude 适配器） */
  hooks: ManifestHookEntry[];
  /** 添加到 settings.json 的环境变量（Claude 适配器） */
  envVars: ManifestEnvEntry[];
  /** autoMemoryEnabled 是否由 EvoKit 设置 */
  autoMemoryEnabledSet: boolean;
  /** 安装时添加的 permissions.allow 规则 */
  permissionsAllow?: string[];
  /** 已弃用：permissionsDeny 不再由框架写入 */
  permissionsDeny?: string[];
  /** 合并的代理 frontmatter 字段（Claude/OpenCode 适配器） */
  agentFrontmatter: ManifestAgentFrontmatter[];
  /** 已安装的 memory 初始化文件 */
  memorySeeds: string[];
  /** 已安装的技能目录 */
  skillDirs: string[];
}

/** 顶层清单结构 */
export interface EvoKitManifest {
  /** 清单模式版本 */
  version: 1;
  /** 写入此清单的 EvoKit 版本 */
  evokitVersion: string;
  /** 最后一次写入清单的时间戳 */
  updatedAt: string;
  /** 按适配器 ID 索引的安装记录 */
  adapters: Record<string, AdapterManifest>;
}

// ─── 路径辅助函数 ────────────────────────────────────────────

/** 清单文件路径 */
export function manifestPath(homeDir: string): string {
  return path.join(homeDir, '.evokit', 'manifest.json');
}

/** 确保 ~/.evokit/ 目录存在 */
export function ensureManifestDir(homeDir: string): void {
  fse.ensureDirSync(path.join(homeDir, '.evokit'));
}

// ─── 读取 / 写入 ────────────────────────────────────────────

/** 读取清单，若不存在或无效则返回 null */
export function readManifest(homeDir: string): EvoKitManifest | null {
  const fp = manifestPath(homeDir);
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as EvoKitManifest;
  } catch {
    return null;
  }
}

/** 原子写入清单（先写入 .tmp，再重命名） */
export function writeManifest(homeDir: string, manifest: EvoKitManifest): void {
  ensureManifestDir(homeDir);
  const fp = manifestPath(homeDir);
  const tmpPath = fp + '.tmp';

  const json = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(tmpPath, json, 'utf-8');

  // 重命名前验证写入的 JSON
  try {
    JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  } catch {
    fse.removeSync(tmpPath);
    throw new Error('清单写入验证失败 —— 临时文件已删除');
  }

  fs.renameSync(tmpPath, fp);
}

// ─── 适配器操作 ──────────────────────────────────────────────

/** 更新或添加适配器记录到清单（升级时覆盖） */
export function updateAdapterManifest(
  homeDir: string,
  adapter: AdapterManifest,
  evokitVersion: string,
): void {
  const existing = readManifest(homeDir);
  const manifest: EvoKitManifest = {
    version: 1,
    evokitVersion,
    updatedAt: new Date().toISOString(),
    adapters: {
      ...(existing?.adapters ?? {}),
      [adapter.adapterId]: adapter,
    },
  };
  writeManifest(homeDir, manifest);
}

/** 从清单中移除适配器记录 */
export function removeAdapterFromManifest(homeDir: string, adapterId: string): void {
  const existing = readManifest(homeDir);
  if (!existing) return;

  const adapters = { ...existing.adapters };
  delete adapters[adapterId];

  const manifest: EvoKitManifest = {
    ...existing,
    updatedAt: new Date().toISOString(),
    adapters,
  };
  writeManifest(homeDir, manifest);
}

/** 检查清单中是否还有剩余适配器 */
export function hasRemainingAdapters(homeDir: string): boolean {
  const manifest = readManifest(homeDir);
  if (!manifest) return false;
  return Object.keys(manifest.adapters).length > 0;
}
