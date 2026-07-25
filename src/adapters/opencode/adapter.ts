/**
 * EvoKit — OpenCode CLI 适配器
 *
 * @internal — OpenCode CLI 的适配器实现。OpenCodeAdapter 类继承 BaseAdapter 基类。
 *
 * 为 OpenCode CLI 实现 AgentAdapter 接口。
 * OpenCode 使用：
 * - AGENTS.md 作为 L1 认知核心（全局 + 项目）
 * - ~/.config/opencode/opencode.json 作为全局配置
 * - ~/.config/opencode/agent/ 作为全局子代理定义
 * - ~/.config/opencode/memory/ 作为全局学习数据
 * - ~/.config/opencode/skills/ 作为全局技能
 * - .opencode/tools/ 作为自定义工具
 * - .opencode/agent/ 作为项目级代理覆盖
 *
 * 使用声明式 `LayoutConfig` + `BaseAdapter.buildStandardLayout()` 引擎。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { BaseAdapter, type HeuristicConfig } from '../base-adapter.js';
import type { AdapterVerifyCheck, LayoutConfig } from '../types.js';
import type { InstallSummary, SessionEntry } from '../../core/types.js';
import type { OpenCodeAdapterOptions, OpenCodeInstallConfig } from './types.js';
import type { AdapterLayout } from '../../core/layout-types.js';
import { executeLayout } from '../../core/layout-engine.js';

export const OPENCODE_ADAPTER_VERSION = '0.5.0';

const GLOBAL_DIRS = ['agent', 'memory', 'skills'] as const;
const PROJECT_SUBDIRS = ['tools', 'agent', 'memory'] as const;
const TOOL_FILES = [
  'evokit-boot.ts',
  'evokit-evolve.ts',
  'evokit-memory.ts',
  'evokit-session.ts',
] as const;
const AGENT_FILES = ['architect.md', 'reviewer.md'] as const;
const MEMORY_SEED_FILES = ['README.md', 'learned-rules.md', 'evolution-log.md'] as const;

export function resolveOpenCodeProjectDir(projectDir: string): string {
  return path.join(projectDir, '.opencode');
}

/**
 * 解析 OpenCode 全局配置目录。
 * 遵循 XDG_CONFIG_HOME，默认为 ~/.config/opencode/。
 */
export function resolveOpenCodeConfigHome(homeDir: string): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, 'opencode');
  }
  return path.join(homeDir, '.config', 'opencode');
}

// ─── 声明式布局配置 ──────────────────────────────────────────

/**
 * OpenCode CLI 适配器的声明式布局配置。
 * 由 BaseAdapter.buildStandardLayout() 消费，自动构建完整的 AdapterLayout。
 *
 * 注意：OpenCode 的项目级安装始终存在（projectDir 默认回退到 cwd），
 * 且项目级配置文件（opencode.json）放在 projectDir 根目录而非 .opencode/ 内。
 * 这些差异通过 LayoutConfigProject 的 configFiles 配置来处理。
 */
const LAYOUT_CONFIG: LayoutConfig = {
  globalDirs: [...GLOBAL_DIRS],

  // 认知核心：AGENTS.md 放在 adapterHome（即 globalDir）内
  cognitiveCore: {
    templateName: 'AGENTS.md',
    dstInHome: false,
    strategy: 'skip-if-exists',
    replaceHome: true,
  },

  // 配置文件：opencode.json（skip-if-exists，copy 方式）
  configFiles: [
    {
      templateName: 'opencode.json',
      targetName: 'opencode.json',
      type: 'copy',
      strategy: 'skip-if-exists',
      replaceHome: true,
    },
  ],

  // merge-agents
  mergeAgents: { templateName: 'agent', targetName: 'agent' },

  // seed-memory
  seedMemory: { templateName: 'memory', files: [...MEMORY_SEED_FILES] },

  // copy-skills
  copySkills: { templateName: 'skills', targetName: 'skills' },

  // 全局权限
  permissions: [{ dir: 'memory', extension: '.jsonl', mode: 0o600 }],

  // 项目级配置（OpenCode 始终有项目级安装）
  project: {
    // 项目级配置文件：opencode.json 放在 projectDir 根目录
    configFiles: [
      {
        templateName: 'opencode.json',
        targetName: 'opencode.json',
        type: 'copy',
        strategy: 'skip-if-exists',
        replaceHome: true,
        dstInProjectRoot: true,
      },
    ],
    copyDirs: [
      {
        templateName: 'tools',
        targetName: 'tools',
        filter: '.ts',
        strategy: 'always',
        replaceHome: true,
      },
    ],
    mergeAgents: { templateName: 'agent', targetName: 'agent' },
    seedMemory: { templateName: 'memory', files: [...MEMORY_SEED_FILES] },
    permissions: [{ dir: 'tools', extension: '.ts', mode: 0o644 }],
  },
};

// ─── BaseAdapter 子类实现 ─────────────────────────────────────────

export class OpenCodeAdapter extends BaseAdapter {
  readonly id = 'opencode';
  readonly label = 'OpenCode CLI';
  readonly description = '~/.config/opencode/ + .opencode/';
  readonly version = OPENCODE_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=0.1.0';

  /** OpenCode 全局配置目录，支持 XDG_CONFIG_HOME。 */
  resolveHome(homeDir: string): string {
    return resolveOpenCodeConfigHome(homeDir);
  }

  /** OpenCode 启发式卸载配置 —— 描述实际文件结构。 */
  override getHeuristicConfig(adapterHome: string): HeuristicConfig {
    return {
      configFiles: ['opencode.json'],
      cognitiveCorePath: path.join(adapterHome, 'AGENTS.md'),
      knownDirs: [
        { name: 'agent', extension: '.md' },
        { name: 'skills', extension: '' },
      ],
      skillsDir: path.join(adapterHome, 'skills'),
    };
  }

  /** 构建声明式安装布局。 */
  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
    allowWorkflow?: boolean;
  }): AdapterLayout {
    // OpenCode 的 projectDir 默认回退到 cwd
    const effectiveProjectDir = opts.projectDir || process.cwd();
    return this.buildStandardLayout(LAYOUT_CONFIG, {
      ...opts,
      projectDir: effectiveProjectDir,
    });
  }

  /** 验证检查项。 */
  protected verifyChecks(config: import('../types.js').AdapterInstallConfig): AdapterVerifyCheck[] {
    return verifyOpenCodeInstallation(config.projectDir || process.cwd(), config.homeDir);
  }

  /** OpenCode 项目级配置目录名。 */
  protected override get projectSubdir(): string {
    return '.opencode';
  }

  /** OpenCode 的 projectDir 默认回退到 cwd。 */
  protected override resolveProjectDir(config: import('../types.js').AdapterInstallConfig): string {
    return config.projectDir || process.cwd();
  }
}

// ─── 向后兼容导出 ──────────────────────────────────────────

/**
 * @deprecated 使用 OpenCodeAdapter.buildLayout() 或 buildStandardLayout() 代替。
 * 保留此函数仅为向后兼容（独立 API 和测试可能直接调用）。
 */
export function getLayout(opts: {
  homeDir: string;
  projectDir: string;
  templateDir: string;
}): AdapterLayout {
  const adapter = new OpenCodeAdapter();
  return adapter.buildStandardLayout(LAYOUT_CONFIG, {
    homeDir: opts.homeDir,
    projectDir: opts.projectDir,
    templateDir: opts.templateDir,
  });
}

// ─── Standalone API ──────────────────────────────────────────────

/**
 * Install EvoKit for OpenCode CLI.
 * Delegates to the layout engine via `getLayout()` + `executeLayout()`.
 */
export function installOpenCode(config: OpenCodeInstallConfig): InstallSummary {
  const opencodeTemplateDir = path.join(config.templateDir, 'opencode');
  const dryRun = config.dryRun ?? false;

  // Validate template exists
  if (!fse.existsSync(path.join(opencodeTemplateDir, 'AGENTS.md'))) {
    throw new Error(
      `OpenCode template not found at: ${opencodeTemplateDir}\n` +
        '  Ensure the template directory contains an opencode/ subdirectory with AGENTS.md.',
    );
  }

  // Ensure project .opencode/ directory exists (outside targetDir/globalDir)
  if (!dryRun) {
    fse.ensureDirSync(path.join(config.projectDir, '.opencode'));
  }

  const layout = getLayout({
    homeDir: config.homeDir,
    projectDir: config.projectDir,
    templateDir: config.templateDir,
  });
  return executeLayout(layout, {
    homeDir: config.homeDir,
    dryRun,
  });
}

/**
 * Set up EvoKit for OpenCode.
 * OpenCode has no hook system — this is a no-op.
 * Lifecycle events (boot, session) are handled via custom tools.
 */
export function setupOpenCodeTools(
  _projectDir: string,
  _options: OpenCodeAdapterOptions = {},
): void {
  // No-op: OpenCode has no lifecycle hooks.
  // Use the custom tools in .opencode/tools/ instead.
}

/**
 * Resolve the memory directory for OpenCode.
 * Uses global ~/.config/opencode/memory/ by default.
 */
export function resolveMemoryDir(projectDir: string, options: OpenCodeAdapterOptions = {}): string {
  // If a custom opencodeDir is provided (legacy), use it
  if (options.opencodeDir) {
    return path.join(path.resolve(options.opencodeDir), 'memory');
  }
  // Otherwise use the OpenCode config home convention
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(resolveOpenCodeConfigHome(homeDir), 'memory');
}

/**
 * Inject learning data into OpenCode-accessible memory.
 * Writes corrections and observations to ~/.config/opencode/memory/.
 */
export function injectOpenCodeMemory(
  projectDir: string,
  data: {
    corrections?: Array<{ pattern: string; context: string }>;
    observations?: Array<{ pattern: string; confidence: number; source: string }>;
    learnedRules?: string;
  },
  options: OpenCodeAdapterOptions = {},
): number {
  const memoryDir = resolveMemoryDir(projectDir, options);
  fse.ensureDirSync(memoryDir);
  let filesWritten = 0;

  // Append corrections
  if (data.corrections?.length) {
    const correctionsPath = path.join(memoryDir, 'corrections.jsonl');
    const lines = data.corrections.map((c) =>
      JSON.stringify({
        timestamp: new Date().toISOString(),
        pattern: c.pattern,
        context: c.context,
        count: 1,
      }),
    );
    fs.appendFileSync(correctionsPath, lines.join('\n') + '\n', 'utf-8');
    fs.chmodSync(correctionsPath, 0o600);
    filesWritten++;
  }

  // Append observations
  if (data.observations?.length) {
    const observationsPath = path.join(memoryDir, 'observations.jsonl');
    const lines = data.observations.map((o) =>
      JSON.stringify({
        timestamp: new Date().toISOString(),
        pattern: o.pattern,
        confidence: o.confidence,
        source: o.source,
      }),
    );
    fs.appendFileSync(observationsPath, lines.join('\n') + '\n', 'utf-8');
    fs.chmodSync(observationsPath, 0o600);
    filesWritten++;
  }

  return filesWritten;
}

/**
 * Export learning data from OpenCode memory.
 */
export function exportOpenCodeMemory(
  projectDir: string,
  options: OpenCodeAdapterOptions = {},
): {
  corrections: unknown[];
  observations: unknown[];
  learnedRules: string;
  sessions: unknown[];
} {
  const memoryDir = resolveMemoryDir(projectDir, options);

  const result = {
    corrections: [] as unknown[],
    observations: [] as unknown[],
    learnedRules: '',
    sessions: [] as unknown[],
  };

  // Parse corrections.jsonl
  const correctionsPath = path.join(memoryDir, 'corrections.jsonl');
  if (fse.existsSync(correctionsPath)) {
    result.corrections = fs
      .readFileSync(correctionsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // Parse observations.jsonl
  const observationsPath = path.join(memoryDir, 'observations.jsonl');
  if (fse.existsSync(observationsPath)) {
    result.observations = fs
      .readFileSync(observationsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // Read learned-rules.md
  const rulesPath = path.join(memoryDir, 'learned-rules.md');
  if (fse.existsSync(rulesPath)) {
    result.learnedRules = fs.readFileSync(rulesPath, 'utf-8');
  }

  // Parse sessions.jsonl
  const sessionsPath = path.join(memoryDir, 'sessions.jsonl');
  if (fse.existsSync(sessionsPath)) {
    result.sessions = fs
      .readFileSync(sessionsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as SessionEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  return result;
}

/**
 * Record a session entry tagged with the OpenCode assistant name.
 */
export function recordOpenCodeSession(
  projectDir: string,
  session: Omit<SessionEntry, 'timestamp' | 'assistant'>,
  options: OpenCodeAdapterOptions = {},
): void {
  const memoryDir = resolveMemoryDir(projectDir, options);
  fse.ensureDirSync(memoryDir);

  const sessionsPath = path.join(memoryDir, 'sessions.jsonl');
  const entry: SessionEntry = {
    timestamp: new Date().toISOString(),
    assistant: 'opencode',
    ...session,
  };

  fs.appendFileSync(sessionsPath, JSON.stringify(entry) + '\n', 'utf-8');
  fs.chmodSync(sessionsPath, 0o600);
}

/**
 * Get the status summary of an OpenCode EvoKit installation.
 */
export function getOpenCodeStatus(projectDir: string): {
  installed: boolean;
  projectDir: string;
  agentsPresent: boolean;
  configPresent: boolean;
  toolsPresent: boolean;
  memoryPresent: boolean;
  agentCount: number;
  error?: string;
} {
  const opencodeDir = resolveOpenCodeProjectDir(projectDir);
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const globalDir = resolveOpenCodeConfigHome(homeDir);

  const result = {
    installed: false,
    projectDir,
    agentsPresent: false,
    configPresent: false,
    toolsPresent: false,
    memoryPresent: false,
    agentCount: 0,
  };

  try {
    // Check global config
    result.agentsPresent = fse.existsSync(path.join(globalDir, 'AGENTS.md'));
    result.configPresent = fse.existsSync(path.join(globalDir, 'opencode.json'));

    // Check project-level tools
    const toolsDir = path.join(opencodeDir, 'tools');
    if (fse.existsSync(toolsDir)) {
      result.toolsPresent = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.ts')).length > 0;
    }

    // Check global agents
    const globalAgentDir = path.join(globalDir, 'agent');
    if (fse.existsSync(globalAgentDir)) {
      result.agentCount = fs.readdirSync(globalAgentDir).filter((f) => f.endsWith('.md')).length;
    }

    // Check global memory
    result.memoryPresent = fse.existsSync(path.join(globalDir, 'memory'));

    result.installed = result.agentsPresent || result.configPresent || result.toolsPresent;
  } catch (e) {
    return { ...result, error: (e as Error).message };
  }

  return result;
}

// ─── Verification ─────────────────────────────────────────────

/**
 * Verify an OpenCode EvoKit installation (both global and project).
 */
export function verifyOpenCodeInstallation(
  projectDir: string,
  homeDir: string,
): AdapterVerifyCheck[] {
  const opencodeDir = path.join(projectDir, '.opencode');
  const globalDir = resolveOpenCodeConfigHome(homeDir);
  const checks: AdapterVerifyCheck[] = [];

  // Global config
  checks.push({
    name: '~/.config/opencode/AGENTS.md (global)',
    pass: fse.existsSync(path.join(globalDir, 'AGENTS.md')),
  });
  checks.push({
    name: '~/.config/opencode/opencode.json (global)',
    pass: fse.existsSync(path.join(globalDir, 'opencode.json')),
  });
  for (const subdir of GLOBAL_DIRS) {
    checks.push({
      name: `~/.config/opencode/${subdir}/`,
      pass: fse.existsSync(path.join(globalDir, subdir)),
    });
  }

  // Project root files
  for (const file of ['AGENTS.md', 'opencode.json']) {
    const exists = fse.existsSync(path.join(projectDir, file));
    checks.push({
      name: `${file} (project root)`,
      pass: exists,
      detail: exists ? undefined : 'Missing file',
    });
  }

  // Project subdirectories
  for (const subdir of PROJECT_SUBDIRS) {
    const exists = fse.existsSync(path.join(opencodeDir, subdir));
    checks.push({
      name: `.opencode/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : 'Missing directory',
    });
  }

  // Tool files
  const toolsDir = path.join(opencodeDir, 'tools');
  if (fse.existsSync(toolsDir)) {
    for (const toolFile of TOOL_FILES) {
      const exists = fse.existsSync(path.join(toolsDir, toolFile));
      checks.push({
        name: `.opencode/tools/${toolFile}`,
        pass: exists,
        detail: exists ? undefined : 'Missing tool',
      });
    }
  }

  // Agent files (global)
  const globalAgentDir = path.join(globalDir, 'agent');
  if (fse.existsSync(globalAgentDir)) {
    for (const agentFile of AGENT_FILES) {
      const exists = fse.existsSync(path.join(globalAgentDir, agentFile));
      checks.push({
        name: `~/.config/opencode/agent/${agentFile}`,
        pass: exists,
        detail: exists ? undefined : 'Missing agent definition',
      });
    }
  }

  // Global memory directory
  const globalMemDir = path.join(globalDir, 'memory');
  checks.push({
    name: `~/.config/opencode/memory/`,
    pass: true,
    detail: fse.existsSync(globalMemDir)
      ? undefined
      : 'Not yet created (auto-created on first memory write)',
  });

  return checks;
}
