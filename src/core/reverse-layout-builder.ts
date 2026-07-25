/**
 * EvoKit — 反向布局构建器
 *
 * 从 manifest 或适配器启发式配置构建 `ReverseLayout`。
 * - `buildReverseLayout()` — 从 manifest 自动推导
 * - `buildHeuristicReverseLayout()` — 从适配器启发式配置推导（清单缺失时的回退）
 *
 * 无论哪种来源，构建出的 ReverseLayout 都走统一的 executeReverseLayout() 路径。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

import type { AdapterManifest } from './manifest.js';
import type { AdapterInternal } from '../adapters/types.js';

import {
  getAdapterBoolean,
  getAdapterNullable,
  getAdapterHome,
  getAdapterHeuristicConfig,
  buildVirtualManifest,
  buildHeuristicAgentRecords,
} from './reverse-heuristic-helpers.js';

import type { ReverseLayout, ReverseSection } from './reverse-layout-types.js';

// ─── 从 manifest 构建 ────────────────────────────────────────

/** 从 manifest 构建 ReverseLayout */
export function buildReverseLayout(
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
      purge,
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

// ─── 从启发式配置构建 ────────────────────────────────────────

/** 从启发式配置构建 ReverseLayout（清单缺失时的回退） */
export function buildHeuristicReverseLayout(
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
