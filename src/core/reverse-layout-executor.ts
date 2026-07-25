/**
 * EvoKit — 反向布局执行器
 *
 * 按顺序处理声明式 `ReverseLayout` 中的每个 section 来执行卸载。
 * 与安装侧的 `executeLayout()` 对称 ——
 * 安装侧有 AdapterLayout → executeLayout，卸载侧有 ReverseLayout → executeReverseLayout。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

import { reverseMergeSettings } from './reverse-merge-settings.js';
import { reverseMergeAgents } from './reverse-merge-agents.js';
import { removeClaudeMdSection } from './remove-claude-md.js';

import type {
  ReverseLayout,
  ReverseMergeSettingsSection,
  ReverseMergeAgentsSection,
  ReverseRemoveCognitiveSection,
  ReverseDeleteFilesSection,
  ReverseDeleteSkillsSection,
  ReverseCleanupDirsSection,
  ReversePurgeMemorySection,
  ReversePurgeSettingsSection,
} from './reverse-layout-types.js';

// ─── 常量 ────────────────────────────────────────────────────

/** 默认保留的用户数据文件（非清除模式下） */
const PRESERVED_FILE_NAMES = new Set([
  'MEMORY.md',
  'corrections.jsonl',
  'observations.jsonl',
  'learned-rules.md',
  'evolution-log.md',
  'sessions.jsonl',
  'violations.jsonl',
]);

// ─── 执行结果 ────────────────────────────────────────────────

/** executeReverseLayout 的内部结果 */
export interface ReverseLayoutResult {
  filesDeleted: number;
  filesPreserved: number;
  hooksRemoved: number;
  envVarsRemoved: number;
  agentFieldsRemoved: number;
  permissionsAllowRemoved: number;
  directoriesRemoved: number;
  /** 已删除的文件相对路径列表 */
  deletedFiles: string[];
}

// ─── 主执行入口 ──────────────────────────────────────────────

/**
 * 执行 `ReverseLayout` —— 按顺序处理每个 section 执行卸载。
 * 与安装侧的 `executeLayout()` 对称。
 */
export function executeReverseLayout(layout: ReverseLayout, dryRun: boolean): ReverseLayoutResult {
  const result: ReverseLayoutResult = {
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
    permissionsAllowRemoved: 0,
    directoriesRemoved: 0,
    deletedFiles: [],
  };

  for (const section of layout.sections) {
    switch (section.type) {
      case 'reverse-merge-settings':
        executeReverseMergeSettings(section, dryRun, result);
        break;
      case 'reverse-merge-agents':
        executeReverseMergeAgents(section, dryRun, result);
        break;
      case 'reverse-remove-cognitive':
        executeReverseRemoveCognitive(section, dryRun, result);
        break;
      case 'reverse-delete-files':
        executeReverseDeleteFiles(section, dryRun, result);
        break;
      case 'reverse-delete-skills':
        executeReverseDeleteSkills(section, dryRun, result);
        break;
      case 'reverse-cleanup-dirs':
        executeReverseCleanupDirs(section, dryRun, result);
        break;
      case 'reverse-purge-memory':
        executeReversePurgeMemory(section, dryRun, result);
        break;
      case 'reverse-purge-settings':
        executeReversePurgeSettings(section, dryRun, result);
        break;
      case 'reverse-remove-manifest':
        // manifest 移除在 executeUninstall 主流程中处理
        break;
    }
  }

  return result;
}

// ─── Section 执行器 ──────────────────────────────────────────

function executeReverseMergeSettings(
  section: ReverseMergeSettingsSection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  const { settingsPath, manifest } = section;

  if (!fse.existsSync(settingsPath)) return;

  const reverseResult = reverseMergeSettings(settingsPath, manifest, dryRun);
  result.hooksRemoved = reverseResult.hooksRemoved;
  result.envVarsRemoved = reverseResult.envVarsRemoved;
  result.permissionsAllowRemoved = reverseResult.permissionsAllowRemoved;
  if (reverseResult.fileDeleted) {
    result.filesDeleted++;
  }
}

function executeReverseMergeAgents(
  section: ReverseMergeAgentsSection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  const { agentsDir, agentFrontmatter } = section;

  if (!fse.existsSync(agentsDir)) return;

  const agentResults = reverseMergeAgents(agentsDir, agentFrontmatter, dryRun);
  result.agentFieldsRemoved = agentResults.reduce((sum, r) => sum + r.fieldsRemoved, 0);
  // 统计已删除的代理文件
  result.filesDeleted += agentResults.filter((r) => r.action === 'deleted').length;
}

function executeReverseRemoveCognitive(
  section: ReverseRemoveCognitiveSection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  const { filePath, appendMarker } = section;

  if (!fse.existsSync(filePath)) return;

  const removeResult = removeClaudeMdSection(filePath, appendMarker, dryRun);
  if (removeResult.action === 'file-deleted') {
    result.filesDeleted++;
  }
  // section-removed 不计入 filesDeleted（文件仍存在，只是内容被修改）
}

function executeReverseDeleteFiles(
  section: ReverseDeleteFilesSection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  const { files, handledSources, purge } = section;

  for (const fileRecord of files) {
    const filePath = fileRecord.path;
    if (!fse.existsSync(filePath)) continue;

    // 跳过已由其他 section 处理的文件
    if (handledSources.has(fileRecord.source)) {
      continue;
    }

    const basename = path.basename(filePath);
    const dirName = path.basename(path.dirname(filePath));

    // 跳过用户数据文件，除非 purge
    if (!purge) {
      if (PRESERVED_FILE_NAMES.has(basename)) {
        result.filesPreserved++;
        continue;
      }
      // 保留 memory/*.jsonl 文件
      if (dirName === 'memory' && basename.endsWith('.jsonl')) {
        result.filesPreserved++;
        continue;
      }
      // 保留 memory/learned-rules.md 和 memory/evolution-log.md
      if (
        dirName === 'memory' &&
        (basename === 'learned-rules.md' || basename === 'evolution-log.md')
      ) {
        result.filesPreserved++;
        continue;
      }
    }

    // 始终删除 memory/README.md（EvoKit 种子）
    // 删除文件
    if (!dryRun) {
      fse.removeSync(filePath);
    }
    result.filesDeleted++;
    result.deletedFiles.push(filePath);
  }
}

function executeReverseDeleteSkills(
  section: ReverseDeleteSkillsSection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  for (const skillDir of section.skillDirs) {
    const skillPath = path.isAbsolute(skillDir) ? skillDir : skillDir;
    if (fse.existsSync(skillPath)) {
      if (!dryRun) {
        fse.removeSync(skillPath);
      }
      result.filesDeleted++;
    }
  }
}

function executeReverseCleanupDirs(
  section: ReverseCleanupDirsSection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  result.directoriesRemoved = cleanupEmptyDirs(section.directories, dryRun);
}

function executeReversePurgeMemory(
  section: ReversePurgeMemorySection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  for (const memDir of section.memoryDirs) {
    if (fse.existsSync(memDir)) {
      if (!dryRun) {
        fse.removeSync(memDir);
      }
      result.filesDeleted++;
    }
  }
}

function executeReversePurgeSettings(
  section: ReversePurgeSettingsSection,
  dryRun: boolean,
  result: ReverseLayoutResult,
): void {
  if (fse.existsSync(section.settingsPath)) {
    if (!dryRun) {
      fse.removeSync(section.settingsPath);
    }
    result.filesDeleted++;
  }
}

// ─── 通用辅助函数 ────────────────────────────────────────────

/**
 * 创建将要修改或删除的文件的备份。
 * 保留相对于 homeDir 的路径。
 */
export function createUninstallBackup(
  filesToBackup: string[],
  backupDir: string,
  homeDir: string,
  dryRun: boolean,
): void {
  if (dryRun) return;

  fse.ensureDirSync(backupDir);

  for (const filePath of filesToBackup) {
    if (!fse.existsSync(filePath)) continue;

    // 计算相对于 homeDir 的路径
    const relPath = path.relative(homeDir, filePath);
    const backupPath = path.join(backupDir, relPath);

    try {
      fse.copySync(filePath, backupPath);
    } catch {
      // 跳过无法备份的文件（权限等）
    }
  }
}

/**
 * 清理空目录，优先处理最深层的目录。
 * 返回已移除的目录数。
 */
export function cleanupEmptyDirs(dirs: string[], dryRun: boolean): number {
  let removed = 0;

  // 按深度排序（最深优先）— 更多路径分隔符 = 更深
  const sorted = [...dirs].sort((a, b) => {
    const depthA = a.split(path.sep).length;
    const depthB = b.split(path.sep).length;
    return depthB - depthA;
  });

  for (const dir of sorted) {
    if (!fse.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        if (!dryRun) {
          fse.removeSync(dir);
        }
        removed++;
      }
    } catch {
      // 目录不可访问 — 跳过
    }
  }

  return removed;
}
