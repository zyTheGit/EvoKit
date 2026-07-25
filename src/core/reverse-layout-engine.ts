/**
 * EvoKit — 反向布局执行引擎
 *
 * 按顺序处理声明式 `ReverseLayout` 中的每个 section 来执行卸载。
 * 与安装侧的 `executeLayout()` 对称 ——
 * 安装侧有 AdapterLayout → executeLayout，卸载侧有 ReverseLayout → executeReverseLayout。
 *
 * ReverseLayout 由 `buildReverseLayout()` 从 manifest 自动推导，
 * 或由 `buildHeuristicReverseLayout()` 从适配器启发式配置推导。
 * 无论哪种来源，都走统一的 executeReverseLayout() 路径。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

import { reverseMergeSettings } from './reverse-merge-settings.js';
import { reverseMergeAgents } from './reverse-merge-agents.js';
import { removeClaudeMdSection } from './remove-claude-md.js';
import {
  readManifest,
  removeAdapterFromManifest,
  hasRemainingAdapters,
  manifestPath,
} from './manifest.js';
import type { AdapterManifest } from './manifest.js';
import { getAdapterInternal } from '../adapters/registry.js';
import type { AdapterInternal } from '../adapters/types.js';
import type { HeuristicConfig } from '../adapters/base-adapter.js';

import type {
  ReverseLayout,
  ReverseSection,
  ReverseMergeSettingsSection,
  ReverseMergeAgentsSection,
  ReverseRemoveCognitiveSection,
  ReverseDeleteFilesSection,
  ReverseDeleteSkillsSection,
  ReverseCleanupDirsSection,
  ReversePurgeMemorySection,
  ReversePurgeSettingsSection,
} from './reverse-layout-types.js';

// ─── 公共接口 ────────────────────────────────────────────────

/** 卸载操作的选项 */
export interface UninstallOptions {
  /** 用户的家目录 */
  homeDir: string;
  /** 要卸载的适配器 ID（例如 'claude', 'codex'） */
  adapterId: string;
  /** 删除用户数据文件（MEMORY.md, memory/*.jsonl 等） */
  purge: boolean;
  /** 试运行模式 — 计算变更但不写入 */
  dryRun: boolean;
  /** 跳过备份创建 */
  noBackup: boolean;
  /** 自定义备份目录（默认：~/.evokit/backup/uninstall-YYYYMMDD/） */
  backupDir?: string;
  /** 项目目录（用于项目级适配器） */
  projectDir?: string;
  /**
   * 适配器实例（可选）。
   * 传入后可避免通过 registry 查找，解决循环依赖问题。
   * BaseAdapter.uninstall() 会传入 this；CLI 命令通过 registry 查找。
   */
  adapter?: AdapterInternal;
}

/** 卸载操作的结果 */
export interface UninstallResult {
  /** 已卸载的适配器 ID */
  adapterId: string;
  /** 删除的文件数 */
  filesDeleted: number;
  /** 保留的文件数（非清除模式下的用户数据） */
  filesPreserved: number;
  /** 从 settings.json 移除的钩子条目数 */
  hooksRemoved: number;
  /** 从 settings.json 移除的环境变量数 */
  envVarsRemoved: number;
  /** 移除的 agent frontmatter 字段数 */
  agentFieldsRemoved: number;
  /** 移除的 permissions.allow 规则数 */
  permissionsAllowRemoved: number;
  /** 移除的空目录数 */
  directoriesRemoved: number;
  /** 备份目录路径（如已创建） */
  backupPath?: string;
  /** 是否使用了启发式（无清单）模式 */
  heuristic: boolean;
  /** 卸载过程中遇到的警告 */
  warnings: string[];
}

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

// ─── 主入口 ──────────────────────────────────────────────────

/**
 * 执行适配器的完整卸载过程。
 *
 * 读取清单、构建 ReverseLayout、备份文件、执行反向布局。
 * 如果清单不存在，通过启发式配置构建虚拟 manifest，然后走统一路径。
 */
export function executeUninstall(options: UninstallOptions): UninstallResult {
  const { homeDir, adapterId, purge, dryRun, noBackup, backupDir, projectDir, adapter } = options;

  const result: UninstallResult = {
    adapterId,
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
    permissionsAllowRemoved: 0,
    directoriesRemoved: 0,
    heuristic: false,
    warnings: [],
  };

  // 1. 读取清单
  const manifest = readManifest(homeDir);
  const adapterRecord = manifest?.adapters?.[adapterId];

  // 2. 构建 ReverseLayout
  let reverseLayout: ReverseLayout;
  if (adapterRecord) {
    reverseLayout = buildReverseLayout(adapterRecord, {
      purge,
      projectDir,
      adapterId,
      adapter,
    });
  } else {
    // 清单不存在或适配器未找到 → 启发式构建
    result.heuristic = true;
    result.warnings.push('未找到清单文件 — 使用启发式卸载。部分文件可能被遗漏。');
    reverseLayout = buildHeuristicReverseLayout(homeDir, adapterId, {
      purge,
      projectDir,
      adapter,
    });
  }

  // 3. 收集要备份的文件
  const filesToBackup = collectBackupFiles(reverseLayout, adapterRecord);

  // 4. 创建备份（除非 noBackup）
  if (!noBackup && filesToBackup.length > 0) {
    const bkDir =
      backupDir ||
      path.join(
        homeDir,
        '.evokit',
        'backup',
        `uninstall-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      );

    createUninstallBackup(filesToBackup, bkDir, homeDir, dryRun);
    if (!dryRun) {
      result.backupPath = bkDir;
    }
  }

  // 5. 执行反向布局
  const sectionResult = executeReverseLayout(reverseLayout, dryRun);
  result.filesDeleted += sectionResult.filesDeleted;
  result.filesPreserved += sectionResult.filesPreserved;
  result.hooksRemoved += sectionResult.hooksRemoved;
  result.envVarsRemoved += sectionResult.envVarsRemoved;
  result.agentFieldsRemoved += sectionResult.agentFieldsRemoved;
  result.permissionsAllowRemoved += sectionResult.permissionsAllowRemoved;
  result.directoriesRemoved += sectionResult.directoriesRemoved;

  // 6. 从清单中移除适配器（非 dry-run）
  if (!dryRun) {
    removeAdapterFromManifest(homeDir, adapterId);

    // 如果没有适配器剩余，清理 ~/.evokit/manifest.json
    if (!hasRemainingAdapters(homeDir)) {
      const mPath = manifestPath(homeDir);
      if (fse.existsSync(mPath)) {
        fse.removeSync(mPath);
      }
      // 尝试移除 ~/.evokit/（如果为空）
      const evokitDir = path.join(homeDir, '.evokit');
      try {
        if (fs.readdirSync(evokitDir).length === 0) {
          fse.removeSync(evokitDir);
        }
      } catch {
        // 目录非空或不存在 — 忽略
      }
    }
  }

  if (result.heuristic) {
    result.warnings.push('启发式卸载已完成。请验证没有用户数据被意外删除。');
  }

  return result;
}

// ─── ReverseLayout 构建 ──────────────────────────────────────

/** 从 manifest 构建 ReverseLayout */
function buildReverseLayout(
  manifest: AdapterManifest,
  opts: {
    purge: boolean;
    projectDir?: string;
    adapterId: string;
    adapter?: AdapterInternal;
  },
): ReverseLayout {
  const { purge, projectDir, adapterId, adapter } = opts;
  const adapterHome = manifest.adapterHome;
  const sections: ReverseSection[] = [];

  // 判断适配器是否需要反向合并 settings
  const shouldReverseMerge = getAdapterBoolean(
    adapterId,
    (a) => a.reverseMergesSettings?.() ?? false,
    false,
    adapter,
  );

  // 判断适配器是否有认知核心追加标记
  const appendMarker = getAdapterNullable<string>(
    adapterId,
    (a) => a.cognitiveCoreAppendMarker?.() ?? null,
    null,
    adapter,
  );

  // 已由其他 section 处理的 source 类型
  const handledSources = new Set<string>();
  if (shouldReverseMerge) {
    handledSources.add('merge-settings');
  }
  if (manifest.agentFrontmatter.length > 0) {
    handledSources.add('merge-agents');
  }

  // ── Section 1: 反向合并 settings.json ──
  const settingsPath = path.join(adapterHome, 'settings.json');
  if (shouldReverseMerge) {
    sections.push({
      type: 'reverse-merge-settings',
      settingsPath,
      manifest,
    });
  }

  // ── Section 2: 移除认知核心追加区段 ──
  const cognitiveCoreFile = manifest.files.find((f) => f.mode === 'appended' && f.appendMarker);
  if (appendMarker && cognitiveCoreFile) {
    sections.push({
      type: 'reverse-remove-cognitive',
      filePath: cognitiveCoreFile.path,
      appendMarker: cognitiveCoreFile.appendMarker || appendMarker,
    });
  }

  // ── Section 3: 反向合并 agents ──
  if (manifest.agentFrontmatter.length > 0) {
    const agentsDir = path.join(adapterHome, 'agents');
    sections.push({
      type: 'reverse-merge-agents',
      agentsDir,
      agentFrontmatter: manifest.agentFrontmatter,
    });
  }

  // ── Section 4: 删除已安装的文件 ──
  sections.push({
    type: 'reverse-delete-files',
    files: manifest.files.map((f) => ({ path: f.path, source: f.source })),
    handledSources,
    purge,
  });

  // ── Section 5: 删除技能目录 ──
  if (manifest.skillDirs.length > 0) {
    sections.push({
      type: 'reverse-delete-skills',
      skillDirs: manifest.skillDirs,
    });
  }

  // ── Section 6: Purge 模式 — 删除 memory 目录 ──
  if (purge) {
    const memoryDirs = [
      path.join(adapterHome, 'memory'),
      // 项目级 memory（OpenCode）
      projectDir ? path.join(projectDir, '.opencode', 'memory') : '',
    ].filter(Boolean) as string[];
    if (memoryDirs.length > 0) {
      sections.push({
        type: 'reverse-purge-memory',
        memoryDirs,
      });
    }
  }

  // ── Section 7: Purge 模式 — 删除 settings.json 残留 ──
  if (purge && shouldReverseMerge) {
    sections.push({
      type: 'reverse-purge-settings',
      settingsPath,
    });
  }

  // ── Section 8: 清理空目录 ──
  const dirsToClean = manifest.directories.map((d) =>
    path.isAbsolute(d) ? d : path.join(adapterHome, d),
  );
  if (dirsToClean.length > 0) {
    sections.push({
      type: 'reverse-cleanup-dirs',
      directories: dirsToClean,
    });
  }

  return { adapterHome, sections };
}

/** 从启发式配置构建 ReverseLayout（清单缺失时的回退） */
function buildHeuristicReverseLayout(
  homeDir: string,
  adapterId: string,
  opts: {
    purge: boolean;
    projectDir?: string;
    adapter?: AdapterInternal;
  },
): ReverseLayout {
  const { purge, projectDir, adapter } = opts;

  // 获取适配器家目录
  const adapterHome = getAdapterHome(homeDir, adapterId, adapter);

  // 获取启发式配置
  const heuristicConfig = getAdapterHeuristicConfig(adapterId, adapterHome, adapter);

  // 判断适配器是否需要反向合并 settings
  const shouldReverseMerge = getAdapterBoolean(
    adapterId,
    (a) =>
      'reverseMergesSettings' in a && typeof a.reverseMergesSettings === 'function'
        ? (a as { reverseMergesSettings: () => boolean }).reverseMergesSettings()
        : false,
    false,
    adapter,
  );

  // 判断适配器是否有认知核心追加标记
  const appendMarker = getAdapterNullable<string>(
    adapterId,
    (a) =>
      'cognitiveCoreAppendMarker' in a && typeof a.cognitiveCoreAppendMarker === 'function'
        ? (a as { cognitiveCoreAppendMarker: () => string | null }).cognitiveCoreAppendMarker()
        : null,
    null,
    adapter,
  );

  const sections: ReverseSection[] = [];

  // ── Section 1: 配置文件处理 ──
  for (const cfgFile of heuristicConfig.configFiles) {
    const cfgPath = path.join(adapterHome, cfgFile);
    if (shouldReverseMerge) {
      // 构建虚拟 manifest 用于反向合并
      const virtualManifest = buildVirtualManifest(
        adapterId,
        homeDir,
        adapterHome,
        heuristicConfig,
      );
      sections.push({
        type: 'reverse-merge-settings',
        settingsPath: cfgPath,
        manifest: virtualManifest,
        purge,
      });
    } else {
      // 配置文件为 EvoKit 独占，通过 delete-files section 处理
      // （加入 files 列表即可）
    }
  }

  // ── Section 2: 认知核心文件处理 ──
  if (heuristicConfig.cognitiveCorePath) {
    if (appendMarker) {
      sections.push({
        type: 'reverse-remove-cognitive',
        filePath: heuristicConfig.cognitiveCorePath,
        appendMarker,
      });
    } else {
      // AGENTS.md 为 EvoKit 独占，通过 delete-files section 处理
    }
  }

  // ── Section 3: 反向合并 agents（启发式） ──
  const agentsDir = path.join(adapterHome, 'agents');
  const heuristicAgentRecords = buildHeuristicAgentRecords(agentsDir);
  if (heuristicAgentRecords.length > 0) {
    sections.push({
      type: 'reverse-merge-agents',
      agentsDir,
      agentFrontmatter: heuristicAgentRecords,
    });
  }

  // ── Section 4: 删除已知目录中的文件 ──
  // 收集所有要删除的文件
  const filesToDelete: Array<{ path: string; source: string }> = [];

  // 配置文件（非 reverse-merge 的）
  if (!shouldReverseMerge) {
    for (const cfgFile of heuristicConfig.configFiles) {
      filesToDelete.push({ path: path.join(adapterHome, cfgFile), source: 'heuristic-config' });
    }
  }

  // 认知核心文件（无 appendMarker 的）
  if (heuristicConfig.cognitiveCorePath && !appendMarker) {
    filesToDelete.push({
      path: heuristicConfig.cognitiveCorePath,
      source: 'heuristic-cognitive',
    });
  }

  // 已知目录中的文件
  for (const dirConfig of heuristicConfig.knownDirs) {
    const dirPath = path.join(adapterHome, dirConfig.name);
    if (fse.existsSync(dirPath)) {
      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (dirConfig.extension && !file.endsWith(dirConfig.extension)) continue;
          filesToDelete.push({
            path: path.join(dirPath, file),
            source: 'heuristic-known-dir',
          });
        }
      } catch {
        // 跳过不可读的目录
      }
    }
  }

  // Memory/README.md（EvoKit 种子）
  const memoryReadme = path.join(adapterHome, 'memory', 'README.md');
  if (fse.existsSync(memoryReadme)) {
    filesToDelete.push({ path: memoryReadme, source: 'heuristic-seed' });
  }

  if (filesToDelete.length > 0) {
    sections.push({
      type: 'reverse-delete-files',
      files: filesToDelete,
      handledSources: new Set(), // 启发式模式无已处理的 source
      purge,
    });
  }

  // ── Section 5: 删除技能目录 ──
  if (heuristicConfig.skillsDir) {
    sections.push({
      type: 'reverse-delete-skills',
      skillDirs: [heuristicConfig.skillsDir],
    });
  }

  // ── Section 6: Purge 模式 — 删除 memory 目录 ──
  if (purge) {
    const memoryDirs = [
      path.join(adapterHome, 'memory'),
      projectDir ? path.join(projectDir, '.opencode', 'memory') : '',
    ].filter(Boolean) as string[];
    if (memoryDirs.length > 0) {
      sections.push({
        type: 'reverse-purge-memory',
        memoryDirs,
      });
    }
  }

  // ── Section 7: Purge 模式 — 删除 settings.json 残留 ──
  if (purge && shouldReverseMerge) {
    for (const cfgFile of heuristicConfig.configFiles) {
      sections.push({
        type: 'reverse-purge-settings',
        settingsPath: path.join(adapterHome, cfgFile),
      });
    }
  }

  // ── Section 8: 清理空目录 ──
  const dirsToClean = heuristicConfig.knownDirs
    .map((d) => path.join(adapterHome, d.name))
    .concat([path.join(adapterHome, 'memory'), adapterHome]);
  sections.push({
    type: 'reverse-cleanup-dirs',
    directories: dirsToClean,
  });

  return { adapterHome, sections };
}

// ─── ReverseLayout 执行 ──────────────────────────────────────

/** executeReverseLayout 的内部结果 */
interface ReverseLayoutResult {
  filesDeleted: number;
  filesPreserved: number;
  hooksRemoved: number;
  envVarsRemoved: number;
  agentFieldsRemoved: number;
  permissionsAllowRemoved: number;
  directoriesRemoved: number;
}

/**
 * 执行 `ReverseLayout` —— 按顺序处理每个 section 执行卸载。
 * 与安装侧的 `executeLayout()` 对称。
 */
function executeReverseLayout(layout: ReverseLayout, dryRun: boolean): ReverseLayoutResult {
  const result: ReverseLayoutResult = {
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
    permissionsAllowRemoved: 0,
    directoriesRemoved: 0,
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

// ─── 备份文件收集 ────────────────────────────────────────────

/**
 * 从 ReverseLayout 收集要备份的文件。
 * 对于有 manifest 的情况，也使用 manifest 中的信息。
 */
function collectBackupFiles(
  layout: ReverseLayout,
  _manifest: AdapterManifest | null | undefined,
): string[] {
  const filesToBackup: string[] = [];

  for (const section of layout.sections) {
    switch (section.type) {
      case 'reverse-merge-settings': {
        if (fse.existsSync(section.settingsPath)) {
          filesToBackup.push(section.settingsPath);
        }
        break;
      }
      case 'reverse-remove-cognitive': {
        if (fse.existsSync(section.filePath)) {
          filesToBackup.push(section.filePath);
        }
        break;
      }
      case 'reverse-merge-agents': {
        for (const af of section.agentFrontmatter) {
          const agentPath = path.join(section.agentsDir, af.file);
          if (fse.existsSync(agentPath)) {
            filesToBackup.push(agentPath);
          }
        }
        break;
      }
      case 'reverse-delete-files': {
        for (const fileRecord of section.files) {
          if (fse.existsSync(fileRecord.path)) {
            filesToBackup.push(fileRecord.path);
          }
        }
        break;
      }
      case 'reverse-delete-skills': {
        for (const skillDir of section.skillDirs) {
          if (fse.existsSync(skillDir)) {
            filesToBackup.push(skillDir);
          }
        }
        break;
      }
      // 其他 section 类型不涉及需要备份的文件
    }
  }

  return filesToBackup;
}

// ─── 启发式辅助函数 ──────────────────────────────────────────

/**
 * 构建虚拟 manifest —— 用于启发式卸载中的反向合并 settings。
 * 从 settings.json 中提取 EvoKit 添加的条目。
 */
function buildVirtualManifest(
  adapterId: string,
  homeDir: string,
  adapterHome: string,
  heuristicConfig: HeuristicConfig,
): AdapterManifest {
  // 尝试从 settings.json 中提取 hooks/env 信息
  const hooks: AdapterManifest['hooks'] = [];
  const envVars: AdapterManifest['envVars'] = [];
  let autoMemoryEnabledSet = false;
  const permissionsAllow: string[] = [];

  for (const cfgFile of heuristicConfig.configFiles) {
    const cfgPath = path.join(adapterHome, cfgFile);
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    } catch {
      continue;
    }

    // 提取引用适配器 hooks 目录的钩子
    const hooksMarker = adapterHome.replace(/\\/g, '/') + '/hooks/';
    if (settings.hooks && typeof settings.hooks === 'object') {
      const hooksObj = settings.hooks as Record<string, unknown>;
      for (const [eventName, eventArr] of Object.entries(hooksObj)) {
        if (!Array.isArray(eventArr)) continue;
        for (const group of eventArr) {
          const str = JSON.stringify(group).replace(/\\\\/g, '/');
          if (str.includes(hooksMarker)) {
            hooks.push({ event: eventName, entry: group as Record<string, unknown> });
          }
        }
      }
    }

    // 提取 autoMemoryEnabled
    if (settings.autoMemoryEnabled === true) {
      autoMemoryEnabledSet = true;
    }

    // 提取已知 EvoKit 环境变量
    const knownEnvVars = ['CLAUDE_CODE_DISABLE_AUTO_MEMORY'];
    if (settings.env && typeof settings.env === 'object') {
      const env = settings.env as Record<string, string>;
      for (const key of knownEnvVars) {
        if (key in env) {
          envVars.push({ key, value: env[key] });
        }
      }
    }
  }

  return {
    adapterId,
    adapterVersion: '0.0.0',
    installedAt: '',
    homeDir,
    adapterHome,
    files: [],
    directories: [],
    hooks,
    envVars,
    autoMemoryEnabledSet,
    permissionsAllow,
    agentFrontmatter: [],
    memorySeeds: [],
    skillDirs: [],
  };
}

/**
 * 构建启发式代理 frontmatter 记录。
 * 扫描 agents 目录中的 .md 文件，使用默认字段。
 */
function buildHeuristicAgentRecords(agentsDir: string): ManifestAgentFrontmatter[] {
  if (!fse.existsSync(agentsDir)) return [];

  const records: ManifestAgentFrontmatter[] = [];
  try {
    const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    for (const file of agentFiles) {
      records.push({
        file,
        fields: {
          model: 'sonnet',
          tools: 'Read,Edit,Write,Bash,Grep,Glob,Agent',
          disallowedTools: '',
          memory: 'true',
          maxTurns: '30',
        },
      });
    }
  } catch {
    // 跳过不可读的代理目录
  }

  return records;
}

// ─── 适配器查询辅助函数 ──────────────────────────────────────

/**
 * 安全地从适配器实例查询布尔值。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 若适配器未注册（如第三方或已移除），回退到 fallback。
 */
function getAdapterBoolean(
  adapterId: string,
  fn: (a: AdapterInternal) => boolean,
  fallback = false,
  adapter?: AdapterInternal,
): boolean {
  try {
    return fn(adapter ?? getAdapterInternal(adapterId));
  } catch {
    return fallback;
  }
}

/**
 * 安全地从适配器实例查询可空值（如 appendMarker）。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 若适配器未注册，回退到 fallback（null）。
 */
function getAdapterNullable<T>(
  adapterId: string,
  fn: (a: AdapterInternal) => T | null,
  fallback: T | null = null,
  adapter?: AdapterInternal,
): T | null {
  try {
    return fn(adapter ?? getAdapterInternal(adapterId));
  } catch {
    return fallback;
  }
}

/**
 * 获取适配器家目录 —— 通过 adapter 实例的 resolveHome()，支持环境变量覆盖。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 替代旧的硬编码 adapterHomes 映射。
 */
function getAdapterHome(homeDir: string, adapterId: string, adapter?: AdapterInternal): string {
  try {
    const inst = adapter ?? getAdapterInternal(adapterId);
    return inst.resolveHome(homeDir);
  } catch {
    // 适配器未注册 —— 回退
  }
  // 回退：未知适配器使用 .${adapterId}
  return path.join(homeDir, `.${adapterId}`);
}

/** 适配器启发式卸载的目录配置 */
interface AdapterHeuristicDirConfig {
  /** 目录名（相对于 adapterHome） */
  name: string;
  /** 文件扩展名过滤（如 '.sh'、'.md'、'.rules'），空字符串表示不过滤 */
  extension: string;
}

/** 适配器启发式卸载的完整配置 */
interface AdapterHeuristicConfig {
  /** 配置文件名列表（相对于 adapterHome） */
  configFiles: string[];
  /** 认知核心文件绝对路径（Claude: ~/CLAUDE.md, 其他: adapterHome/AGENTS.md） */
  cognitiveCorePath: string | null;
  /** 已知目录配置 */
  knownDirs: AdapterHeuristicDirConfig[];
  /** Skills 目录绝对路径 */
  skillsDir: string | null;
}

/**
 * 获取启发式卸载配置 —— 通过 adapter 实例的 getHeuristicConfig()。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 替代旧的硬编码 switch-case。若适配器未注册，回退到 AGENTS.md 通用配置。
 */
function getAdapterHeuristicConfig(
  adapterId: string,
  adapterHome: string,
  adapter?: AdapterInternal,
): AdapterHeuristicConfig {
  try {
    const inst = adapter ?? getAdapterInternal(adapterId);
    return inst.getHeuristicConfig(adapterHome);
  } catch {
    // 适配器未注册 —— 回退
  }
  // 回退：通用 AGENTS.md 配置
  return {
    configFiles: [],
    cognitiveCorePath: path.join(adapterHome, 'AGENTS.md'),
    knownDirs: [{ name: 'hooks', extension: '.sh' }],
    skillsDir: null,
  };
}

// ─── 通用辅助函数 ────────────────────────────────────────────

/**
 * 创建将要修改或删除的文件的备份。
 * 保留相对于 homeDir 的路径。
 */
function createUninstallBackup(
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
function cleanupEmptyDirs(dirs: string[], dryRun: boolean): number {
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
