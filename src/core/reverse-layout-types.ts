/**
 * EvoKit — 反向布局类型
 *
 * 声明式描述适配器卸载管线应执行的操作。
 * 与 `layout-types.ts` 中的 `AdapterLayout` 对称 ——
 * 安装侧有 `executeLayout()`，卸载侧有 `executeReverseLayout()`。
 *
 * 每个 section 类型对应一个 reverse handler，
 * 安装和卸载共享同一套 section 类型注册表。
 *
 * @packageDocumentation
 */

import type { AdapterManifest, ManifestAgentFrontmatter } from './manifest.js';

// ─── Reverse Section 类型 ────────────────────────────────────

/** 反向合并 settings.json — 移除 EvoKit 添加的 hook/env/权限条目。 */
export interface ReverseMergeSettingsSection {
  type: 'reverse-merge-settings';
  /** settings.json 的绝对路径 */
  settingsPath: string;
  /** 适配器安装清单（包含 hooks/envVars/permissions 等记录） */
  manifest: AdapterManifest;
}

/** 反向合并 agents — 移除 EvoKit 添加的 frontmatter 字段。 */
export interface ReverseMergeAgentsSection {
  type: 'reverse-merge-agents';
  /** agents 目录的绝对路径 */
  agentsDir: string;
  /** 代理 frontmatter 记录 */
  agentFrontmatter: ManifestAgentFrontmatter[];
}

/** 移除认知核心追加区段（如 CLAUDE.md 中的 EvoKit 协议段）。 */
export interface ReverseRemoveCognitiveSection {
  type: 'reverse-remove-cognitive';
  /** 认知核心文件的绝对路径 */
  filePath: string;
  /** 追加标记字符串 */
  appendMarker: string;
}

/** 删除已安装的文件。 */
export interface ReverseDeleteFilesSection {
  type: 'reverse-delete-files';
  /** 要删除的文件记录列表 */
  files: Array<{
    /** 文件绝对路径 */
    path: string;
    /** 安装来源（用于跳过已由其他 section 处理的文件） */
    source: string;
  }>;
  /** 已由其他 section 处理的 source 类型集合（这些文件跳过删除） */
  handledSources: Set<string>;
  /** 是否为 purge 模式 */
  purge: boolean;
}

/** 删除技能目录。 */
export interface ReverseDeleteSkillsSection {
  type: 'reverse-delete-skills';
  /** 技能目录路径列表 */
  skillDirs: string[];
}

/** 清理空目录。 */
export interface ReverseCleanupDirsSection {
  type: 'reverse-cleanup-dirs';
  /** 要清理的目录路径列表（最深优先） */
  directories: string[];
}

/** Purge 模式下删除 memory 目录。 */
export interface ReversePurgeMemorySection {
  type: 'reverse-purge-memory';
  /** memory 目录路径列表 */
  memoryDirs: string[];
}

/** Purge 模式下删除 settings.json 残留。 */
export interface ReversePurgeSettingsSection {
  type: 'reverse-purge-settings';
  /** settings.json 路径 */
  settingsPath: string;
}

/** 从清单中移除适配器记录。 */
export interface ReverseRemoveManifestSection {
  type: 'reverse-remove-manifest';
  /** 用户家目录 */
  homeDir: string;
  /** 适配器 ID */
  adapterId: string;
}

/** 反向布局中的单个步骤。 */
export type ReverseSection =
  | ReverseMergeSettingsSection
  | ReverseMergeAgentsSection
  | ReverseRemoveCognitiveSection
  | ReverseDeleteFilesSection
  | ReverseDeleteSkillsSection
  | ReverseCleanupDirsSection
  | ReversePurgeMemorySection
  | ReversePurgeSettingsSection
  | ReverseRemoveManifestSection;

// ─── 反向布局 ────────────────────────────────────────────────

/** 适配器卸载步骤的声明式描述。 */
export interface ReverseLayout {
  /** 适配器家目录的绝对路径 */
  adapterHome: string;
  /** 要按顺序执行的 reverse section 列表 */
  sections: ReverseSection[];
}
