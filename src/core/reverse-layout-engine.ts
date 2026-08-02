/**
 * EvoKit — 反向布局引擎（公共接口 + 编排层）
 *
 * 提供卸载操作的公共入口 `executeUninstall()`，编排以下流程：
 * 1. 读取清单 → 构建 ReverseLayout（委托 builder）
 * 2. 收集备份文件 → 创建备份（委托 executor）
 * 3. 执行反向布局（委托 executor）
 * 4. 清理清单残留
 *
 * 子模块职责划分：
 * - `reverse-layout-builder.ts` — 从 manifest / 启发式配置构建 ReverseLayout
 * - `reverse-layout-executor.ts` — 执行 ReverseLayout 中的各 section
 * - `reverse-heuristic-helpers.ts` — 适配器查询 + 虚拟 manifest 构建
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

import {
  readManifest,
  removeAdapterFromManifest,
  hasRemainingAdapters,
  manifestPath,
} from './manifest.js';
import type { AdapterManifest } from './manifest.js';
import type { AdapterInternal } from '../adapters/types.js';

import { buildReverseLayout, buildHeuristicReverseLayout } from './reverse-layout-builder.js';

import { executeReverseLayout, createUninstallBackup } from './reverse-layout-executor.js';

import type { ReverseLayout } from './reverse-layout-types.js';

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
  /** 适配器家目录（用于显示） */
  adapterHome: string;
  /** 已删除的文件相对路径列表（用于摘要显示） */
  deletedFiles: string[];
  /** 备份目录路径（如已创建） */
  backupPath?: string;
  /** 是否使用了启发式（无清单）模式 */
  heuristic: boolean;
  /** 卸载过程中遇到的警告 */
  warnings: string[];
}

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
    adapterHome: '',
    deletedFiles: [],
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

  // 设置适配器家目录
  result.adapterHome = reverseLayout.adapterHome;

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
  result.deletedFiles.push(...sectionResult.deletedFiles);

  // 6. 从清单中移除适配器（非 dry-run）
  if (!dryRun) {
    removeAdapterFromManifest(homeDir, adapterId);

    // 如果没有适配器剩余，清理 ~/.evokit/manifest.json
    if (!hasRemainingAdapters(homeDir)) {
      const mPath = manifestPath(homeDir);
      if (fse.existsSync(mPath)) {
        fse.removeSync(mPath);
      }
      // 若顶层只剩管理残留、且不在共享知识目录之上，才清空 ~/.evokit/
      // 共享知识根 ~/.evokit/knowledge/ 必须保留（除非用户主动删除），不随卸载/重装回流
      const evokitDir = path.join(homeDir, '.evokit');
      try {
        const entries = fs.readdirSync(evokitDir);
        // 只要存在共享知识子目录，就绝不移除 ~/.evokit/
        const hasSharedKnowledge = entries.includes('knowledge');
        if (!hasSharedKnowledge && entries.length === 0) {
          fse.removeSync(evokitDir);
        }
      } catch {
        // 目录不存在 — 忽略
      }
    }
  }

  if (result.heuristic) {
    result.warnings.push('启发式卸载已完成。请验证没有用户数据被意外删除。');
  }

  return result;
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
