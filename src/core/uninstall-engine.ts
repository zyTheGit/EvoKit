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
  const { homeDir, adapterId, force, purge, dryRun, noBackup, backupDir, projectDir } = options;

  const result: UninstallResult = {
    adapterId,
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
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

  // CLAUDE.md
  const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
  if (fse.existsSync(claudeMdPath)) {
    filesToBackup.push(claudeMdPath);
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

  // 4. 撤销 settings.json 合并（仅适用于 Claude Code 适配器）
  if (adapterId === 'claude' && fse.existsSync(settingsPath)) {
    const reverseResult = reverseMergeSettings(settingsPath, adapterRecord, dryRun);
    result.hooksRemoved = reverseResult.hooksRemoved;
    result.envVarsRemoved = reverseResult.envVarsRemoved;
  }

  // 5. 移除 CLAUDE.md 节（仅适用于 Claude Code 适配器）
  if (adapterId === 'claude' && fse.existsSync(claudeMdPath)) {
    // 从清单文件中查找 appendMarker
    const claudeMdRecord = adapterRecord.files.find(
      (f) => f.path === claudeMdPath && f.mode === 'appended',
    );
    const marker = claudeMdRecord?.appendMarker || 'Self-Evolving System Protocol';
    removeClaudeMdSection(claudeMdPath, marker, dryRun);
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
  const { homeDir, adapterId, purge, dryRun, noBackup, backupDir } = options;

  const result: UninstallResult = {
    adapterId,
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
    directoriesRemoved: 0,
    heuristic: true,
    warnings: ['未找到清单文件 — 使用启发式卸载。部分文件可能被遗漏。'],
  };

  // 根据适配器 ID 确定适配器家目录
  const adapterHome = getAdapterHome(homeDir, adapterId);

  // 根据适配器 ID 确定已知的目录结构和文件扩展名
  const adapterConfig = getAdapterHeuristicConfig(adapterId, adapterHome);

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
  for (const cfgFile of adapterConfig.configFiles) {
    const cfgPath = path.join(adapterHome, cfgFile);
    if (!fse.existsSync(cfgPath)) continue;

    if (adapterId === 'claude') {
      // Claude Code: settings.json 需要反向合并（移除 hooks 条目）
      const heuristicResult = heuristicReverseSettings(cfgPath, homeDir, adapterHome);
      result.hooksRemoved = heuristicResult.hooksRemoved;
      result.envVarsRemoved = heuristicResult.envVarsRemoved;
    } else {
      // 其他适配器: 配置文件为 EvoKit 独占，直接删除
      if (!dryRun) {
        fse.removeSync(cfgPath);
      }
      result.filesDeleted++;
    }
  }

  // 2. 认知核心文件处理
  if (cognitiveCorePath && fse.existsSync(cognitiveCorePath)) {
    if (adapterId === 'claude') {
      // Claude Code: CLAUDE.md 可能包含其他内容，只移除 EvoKit 节
      removeClaudeMdSection(cognitiveCorePath, 'Self-Evolving System Protocol', dryRun);
    } else {
      // 其他适配器: AGENTS.md 为 EvoKit 独占，直接删除
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

/** 根据适配器 ID 获取适配器家目录 */
function getAdapterHome(homeDir: string, adapterId: string): string {
  const adapterHomes: Record<string, string> = {
    claude: '.claude',
    codex: '.codex',
    opencode: '.config/opencode',
    pi: '.pi/agent',
    aider: '.aider',
  };
  const subDir = adapterHomes[adapterId] || `.${adapterId}`;
  return path.join(homeDir, subDir);
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

/** 根据适配器 ID 获取启发式卸载配置 */
function getAdapterHeuristicConfig(adapterId: string, adapterHome: string): AdapterHeuristicConfig {
  switch (adapterId) {
    case 'codex':
      return {
        configFiles: ['hooks.json', 'config.toml'],
        cognitiveCorePath: path.join(adapterHome, 'AGENTS.md'),
        knownDirs: [
          { name: 'hooks-scripts', extension: '.sh' },
          { name: 'rules', extension: '.rules' },
        ],
        skillsDir: null,
      };

    case 'opencode':
      return {
        configFiles: ['opencode.json'],
        cognitiveCorePath: path.join(adapterHome, 'AGENTS.md'),
        knownDirs: [
          { name: 'tools', extension: '.ts' },
          { name: 'agents', extension: '.md' },
        ],
        skillsDir: path.join(adapterHome, 'skills'),
      };

    case 'pi':
      return {
        configFiles: ['settings.json'],
        cognitiveCorePath: path.join(adapterHome, 'AGENTS.md'),
        knownDirs: [
          { name: 'extensions', extension: '.ts' },
          { name: 'agent', extension: '.md' },
        ],
        skillsDir: path.join(adapterHome, 'skills'),
      };

    case 'claude':
    default:
      // Claude Code 的原始配置
      return {
        configFiles: ['settings.json'],
        cognitiveCorePath: path.join(path.dirname(adapterHome), 'CLAUDE.md'),
        knownDirs: [
          { name: 'hooks', extension: '.sh' },
          { name: 'rules', extension: '.md' },
          { name: 'commands', extension: '.md' },
          { name: 'agents', extension: '.md' },
        ],
        skillsDir: path.join(adapterHome, 'skills'),
      };
  }
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
