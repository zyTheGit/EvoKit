/**
 * EvoKit — 卸载引擎
 *
 * 协调完整卸载过程：读取清单、备份文件、
 * 撤销 settings/agent/CLAUDE.md 合并、删除已安装
 * 文件、清理空目录，并从清单中移除适配器。
 *
 * 当清单不存在时，根据适配器已知模板结构
 * 回退到启发式卸载。
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
import type { AdapterManifest, ManifestAgentFrontmatter } from './manifest.js';
import { reverseMergeSettings } from './reverse-merge-settings.js';
import { reverseMergeAgents } from './reverse-merge-agents.js';
import { removeClaudeMdSection } from './remove-claude-md.js';
import { getInstaller } from '../adapters/registry.js';
import type { AdapterInstaller } from '../adapters/types.js';

/** 卸载操作的选项 */
export interface UninstallOptions {
  /** 用户的家目录 */
  homeDir: string;
  /** 要卸载的适配器 ID（例如 'claude', 'codex'） */
  adapterId: string;
  /** 即使出现警告也强制卸载 */
  force: boolean;
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
  adapter?: AdapterInstaller;
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

/** EvoKit 种子文件 — 即使没有 purge 也会删除 */
const SEED_FILE_NAMES = new Set(['README.md']);

/**
 * 执行适配器的完整卸载过程。
 *
 * 读取清单、备份文件、撤销所有合并、删除已安装
 * 文件、清理空目录，并从清单中移除适配器。
 * 如果清单不存在，回退到启发式卸载。
 */
export function executeUninstall(options: UninstallOptions): UninstallResult {
  const { homeDir, adapterId, force, purge, dryRun, noBackup, backupDir, projectDir, adapter } =
    options;

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

  if (!manifest || !adapterRecord) {
    // 清单不存在或适配器未找到 → 启发式卸载
    return executeHeuristicUninstall(options);
  }

  const adapterHome = adapterRecord.adapterHome;

  // 2. 收集要备份的文件
  const filesToBackup: string[] = [];

  // Settings.json
  const settingsPath = path.join(adapterHome, 'settings.json');
  if (fse.existsSync(settingsPath)) {
    filesToBackup.push(settingsPath);
  }

  // 认知核心文件（如 CLAUDE.md 在 home 根目录）
  const cognitiveAppendMarker = getAdapterNullable(
    adapterId,
    (a) => a.cognitiveCoreAppendMarker?.() ?? null,
    null,
    adapter,
  );
  if (cognitiveAppendMarker) {
    const cognitiveCoreFile = adapterRecord.files.find(
      (f) => f.mode === 'appended' && f.appendMarker,
    );
    if (cognitiveCoreFile && fse.existsSync(cognitiveCoreFile.path)) {
      filesToBackup.push(cognitiveCoreFile.path);
    }
  }

  // 代理文件
  const agentsDir = path.join(adapterHome, 'agents');
  for (const af of adapterRecord.agentFrontmatter) {
    const agentPath = path.join(agentsDir, af.file);
    if (fse.existsSync(agentPath)) {
      filesToBackup.push(agentPath);
    }
  }

  // 所有将被删除的文件
  for (const fileRecord of adapterRecord.files) {
    if (fse.existsSync(fileRecord.path)) {
      filesToBackup.push(fileRecord.path);
    }
  }

  // 3. 创建备份（除非 noBackup）
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

  // 4. 撤销 settings.json 合并（仅适用于需要反向合并的适配器）
  const shouldReverseMerge = getAdapterBoolean(
    adapterId,
    (a) => a.reverseMergesSettings?.() ?? false,
    false,
    adapter,
  );
  if (shouldReverseMerge && fse.existsSync(settingsPath)) {
    const reverseResult = reverseMergeSettings(settingsPath, adapterRecord, dryRun);
    result.hooksRemoved = reverseResult.hooksRemoved;
    result.envVarsRemoved = reverseResult.envVarsRemoved;
    result.permissionsAllowRemoved = reverseResult.permissionsAllowRemoved;
    if (reverseResult.fileDeleted) {
      result.filesDeleted++;
    }
  }

  // 5. 移除认知核心追加区段（仅适用于有 appendMarker 的适配器）
  const appendMarker = getAdapterNullable(
    adapterId,
    (a) => a.cognitiveCoreAppendMarker?.() ?? null,
    null,
    adapter,
  );
  const cognitiveCoreFile = adapterRecord.files.find(
    (f) => f.mode === 'appended' && f.appendMarker,
  );
  if (appendMarker && cognitiveCoreFile && fse.existsSync(cognitiveCoreFile.path)) {
    removeClaudeMdSection(
      cognitiveCoreFile.path,
      cognitiveCoreFile.appendMarker || appendMarker,
      dryRun,
    );
  }

  // 6. 撤销 agents 合并
  if (adapterRecord.agentFrontmatter.length > 0 && fse.existsSync(agentsDir)) {
    const agentResults = reverseMergeAgents(agentsDir, adapterRecord.agentFrontmatter, dryRun);
    result.agentFieldsRemoved = agentResults.reduce((sum, r) => sum + r.fieldsRemoved, 0);
    // 统计已删除的代理文件
    result.filesDeleted += agentResults.filter((r) => r.action === 'deleted').length;
  }

  // 7. 删除 EvoKit 管理的文件
  for (const fileRecord of adapterRecord.files) {
    const filePath = fileRecord.path;
    if (!fse.existsSync(filePath)) continue;

    // 跳过已由反向合并步骤处理的文件（步骤 4 和步骤 6）
    // merge-settings: 步骤 4 reverseMergeSettings 已处理（保留/删除）
    // merge-agents: 步骤 6 reverseMergeAgents 已处理（保留/删除/跳过）
    if (fileRecord.source === 'merge-settings' && shouldReverseMerge) {
      continue;
    }
    if (fileRecord.source === 'merge-agents' && adapterRecord.agentFrontmatter.length > 0) {
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

  // 删除技能目录
  for (const skillDir of adapterRecord.skillDirs) {
    const skillPath = path.isAbsolute(skillDir) ? skillDir : path.join(adapterHome, skillDir);
    if (fse.existsSync(skillPath)) {
      if (!dryRun) {
        fse.removeSync(skillPath);
      }
      result.filesDeleted++;
    }
  }

  // 8. 清理空目录（最深优先）
  result.directoriesRemoved = cleanupEmptyDirs(
    adapterRecord.directories.map((d) => (path.isAbsolute(d) ? d : path.join(adapterHome, d))),
    dryRun,
  );

  // 9. 从清单中移除适配器
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

  return result;
}

// ─── 启发式卸载 ──────────────────────────────────────

/**
 * 清单不存在时的启发式卸载。
 *
 * 使用已知模式查找并删除 EvoKit 安装的内容。
 * 根据适配器 ID 使用不同的目录结构和文件类型。
 */
function executeHeuristicUninstall(options: UninstallOptions): UninstallResult {
  const { homeDir, adapterId, purge, dryRun, noBackup, backupDir, adapter } = options;

  const result: UninstallResult = {
    adapterId,
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
    permissionsAllowRemoved: 0,
    directoriesRemoved: 0,
    heuristic: true,
    warnings: ['未找到清单文件 — 使用启发式卸载。部分文件可能被遗漏。'],
  };

  // 根据适配器 ID 确定适配器家目录
  const adapterHome = getAdapterHome(homeDir, adapterId, adapter);

  // 根据适配器 ID 确定已知的目录结构和文件扩展名
  const adapterConfig = getAdapterHeuristicConfig(adapterId, adapterHome, adapter);

  // ── 阶段 1: 收集要备份的文件 ─────────────────────
  const filesToBackup: string[] = [];

  // 配置文件（settings.json 或 hooks.json）
  for (const cfgFile of adapterConfig.configFiles) {
    const cfgPath = path.join(adapterHome, cfgFile);
    if (fse.existsSync(cfgPath)) {
      filesToBackup.push(cfgPath);
    }
  }

  // 认知核心文件（CLAUDE.md 在 home 根目录，AGENTS.md 在 adapterHome 内）
  const cognitiveCorePath = adapterConfig.cognitiveCorePath;
  if (cognitiveCorePath && fse.existsSync(cognitiveCorePath)) {
    filesToBackup.push(cognitiveCorePath);
  }

  // 已知目录中的文件
  for (const dirConfig of adapterConfig.knownDirs) {
    const dirPath = path.join(adapterHome, dirConfig.name);
    if (!fse.existsSync(dirPath)) continue;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (dirConfig.extension && !file.endsWith(dirConfig.extension)) continue;
        filesToBackup.push(path.join(dirPath, file));
      }
    } catch {
      // 跳过不可读的目录
    }
  }

  // Skills 目录
  if (adapterConfig.skillsDir && fse.existsSync(adapterConfig.skillsDir)) {
    filesToBackup.push(adapterConfig.skillsDir);
  }

  const memoryReadme = path.join(adapterHome, 'memory', 'README.md');
  if (fse.existsSync(memoryReadme)) {
    filesToBackup.push(memoryReadme);
  }

  // ── 阶段 2: 在任何修改前创建备份 ──────
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

  // ── 阶段 3: 执行修改 ───────────────────────

  // 1. 配置文件处理
  const shouldReverseMerge = getAdapterBoolean(
    adapterId,
    (a) =>
      'reverseMergesSettings' in a && typeof a.reverseMergesSettings === 'function'
        ? (a as { reverseMergesSettings: () => boolean }).reverseMergesSettings()
        : false,
    false,
    adapter,
  );

  for (const cfgFile of adapterConfig.configFiles) {
    const cfgPath = path.join(adapterHome, cfgFile);
    if (!fse.existsSync(cfgPath)) continue;

    if (shouldReverseMerge) {
      // 需要反向合并的适配器（如 Claude Code 的 settings.json）
      const heuristicResult = heuristicReverseSettings(cfgPath, homeDir, adapterHome);
      result.hooksRemoved = heuristicResult.hooksRemoved;
      result.envVarsRemoved = heuristicResult.envVarsRemoved;
    } else {
      // 配置文件为 EvoKit 独占，直接删除
      if (!dryRun) {
        fse.removeSync(cfgPath);
      }
      result.filesDeleted++;
    }
  }

  // 2. 认知核心文件处理
  const coreAppendMarker = getAdapterNullable<string>(
    adapterId,
    (a) =>
      'cognitiveCoreAppendMarker' in a && typeof a.cognitiveCoreAppendMarker === 'function'
        ? (a as { cognitiveCoreAppendMarker: () => string | null }).cognitiveCoreAppendMarker()
        : null,
    null,
    adapter,
  );

  if (cognitiveCorePath && fse.existsSync(cognitiveCorePath)) {
    if (coreAppendMarker) {
      // 有 appendMarker 的适配器（如 Claude 的 CLAUDE.md）—— 仅移除追加的区段
      removeClaudeMdSection(cognitiveCorePath, coreAppendMarker, dryRun);
    } else {
      // AGENTS.md 为 EvoKit 独占，直接删除
      if (!dryRun) {
        fse.removeSync(cognitiveCorePath);
      }
      result.filesDeleted++;
    }
  }

  // 3. 已知目录中的文件 — 删除
  for (const dirConfig of adapterConfig.knownDirs) {
    const dirPath = path.join(adapterHome, dirConfig.name);
    if (!fse.existsSync(dirPath)) continue;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (dirConfig.extension && !file.endsWith(dirConfig.extension)) continue;
        const filePath = path.join(dirPath, file);
        if (!dryRun) {
          fse.removeSync(filePath);
        }
        result.filesDeleted++;
      }
    } catch {
      // 跳过不可读的目录
    }
  }

  // Skills 目录
  if (adapterConfig.skillsDir && fse.existsSync(adapterConfig.skillsDir)) {
    if (!dryRun) {
      fse.removeSync(adapterConfig.skillsDir);
    }
    result.filesDeleted++;
  }

  // Memory/README.md（EvoKit 种子）
  if (fse.existsSync(memoryReadme)) {
    if (!dryRun) {
      fse.removeSync(memoryReadme);
    }
    result.filesDeleted++;
  }

  // 4. Agent frontmatter 启发式
  const agentsDir = path.join(adapterHome, 'agents');
  if (fse.existsSync(agentsDir)) {
    const heuristicAgentRecords: ManifestAgentFrontmatter[] = [];
    try {
      const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      for (const file of agentFiles) {
        heuristicAgentRecords.push({
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

    if (heuristicAgentRecords.length > 0) {
      const agentResults = reverseMergeAgents(agentsDir, heuristicAgentRecords, dryRun);
      result.agentFieldsRemoved = agentResults.reduce((sum, r) => sum + r.fieldsRemoved, 0);
      result.filesDeleted += agentResults.filter((r) => r.action === 'deleted').length;
    }
  }

  // 5. 清理空目录
  const dirsToClean = adapterConfig.knownDirs
    .map((d) => path.join(adapterHome, d.name))
    .concat([path.join(adapterHome, 'memory'), adapterHome]);
  result.directoriesRemoved = cleanupEmptyDirs(dirsToClean, dryRun);

  result.warnings.push('启发式卸载已完成。请验证没有用户数据被意外删除。');

  return result;
}

// ─── 辅助函数 ──────────────────────────────────────────────────

/**
 * 安全地从适配器实例查询布尔值。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 若适配器未注册（如第三方或已移除），回退到 fallback。
 */
function getAdapterBoolean(
  adapterId: string,
  fn: (a: AdapterInstaller) => boolean,
  fallback = false,
  adapter?: AdapterInstaller,
): boolean {
  try {
    return fn(adapter ?? getInstaller(adapterId));
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
  fn: (a: AdapterInstaller) => T | null,
  fallback: T | null = null,
  adapter?: AdapterInstaller,
): T | null {
  try {
    return fn(adapter ?? getInstaller(adapterId));
  } catch {
    return fallback;
  }
}

/**
 * 获取适配器家目录 —— 通过 adapter 实例的 resolveHome()，支持环境变量覆盖。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 替代旧的硬编码 adapterHomes 映射。
 */
function getAdapterHome(homeDir: string, adapterId: string, adapter?: AdapterInstaller): string {
  try {
    const inst = adapter ?? getInstaller(adapterId);
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
  adapter?: AdapterInstaller,
): AdapterHeuristicConfig {
  try {
    const inst = adapter ?? getInstaller(adapterId);
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

/** 清单不存在时对 settings.json 的启发式撤销 */
function heuristicReverseSettings(
  settingsPath: string,
  homeDir: string,
  adapterHome: string,
): { hooksRemoved: number; envVarsRemoved: number } {
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    /* 文件缺失或 JSON 无效 — 无需撤销 */
    return { hooksRemoved: 0, envVarsRemoved: 0 };
  }

  let hooksRemoved = 0;
  let envVarsRemoved = 0;
  let changed = false;

  // 移除钩子条目，其命令引用适配器的 hooks 目录
  // 使用 adapterHome 避免匹配不相关的钩子（例如 /home/user/my-hooks/）
  const hooksMarker = adapterHome.replace(/\\/g, '/') + '/hooks/';
  if (settings.hooks && typeof settings.hooks === 'object') {
    const hooks = settings.hooks as Record<string, unknown>;
    for (const [eventName, eventArr] of Object.entries(hooks)) {
      if (!Array.isArray(eventArr)) continue;

      const filtered = eventArr.filter((group) => {
        const str = JSON.stringify(group).replace(/\\\\/g, '/');
        // 仅匹配引用此适配器 hooks 目录的钩子
        if (str.includes(hooksMarker)) {
          hooksRemoved++;
          return false;
        }
        return true;
      });

      if (filtered.length !== eventArr.length) {
        changed = true;
        if (filtered.length === 0) {
          delete hooks[eventName];
        } else {
          hooks[eventName] = filtered;
        }
      }
    }

    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // 如果 autoMemoryEnabled 为 true，则移除
  if (settings.autoMemoryEnabled === true) {
    delete settings.autoMemoryEnabled;
    changed = true;
  }

  // 移除已知的 EvoKit 环境变量
  const knownEnvVars = ['CLAUDE_CODE_DISABLE_AUTO_MEMORY'];
  if (settings.env && typeof settings.env === 'object') {
    const env = settings.env as Record<string, string>;
    for (const key of knownEnvVars) {
      if (key in env) {
        delete env[key];
        envVarsRemoved++;
        changed = true;
      }
    }

    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
  }

  if (changed) {
    // 检查是否实际为空
    const keysWithoutSchema = Object.keys(settings).filter((k) => k !== '$schema');
    if (keysWithoutSchema.length === 0) {
      fse.removeSync(settingsPath);
    } else {
      // 原子写入
      const tmpPath = settingsPath + '.reverse.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
      try {
        fs.renameSync(tmpPath, settingsPath);
      } catch {
        /* 原子重命名失败（跨设备或权限问题）— 丢弃临时文件 */
        fse.removeSync(tmpPath);
      }
    }
  }

  return { hooksRemoved, envVarsRemoved };
}

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
