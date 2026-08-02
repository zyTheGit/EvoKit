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
 * 通用 memory/session/status API 亦由 BaseAdapter 提供。
 *
 * @packageDocumentation
 */

import path from 'node:path';
import fse from 'fs-extra';
import { BaseAdapter, type HeuristicConfig } from '../base-adapter.js';
import type { AdapterVerifyCheck, LayoutConfig } from '../types.js';
import type { AdapterLayout } from '../../core/layout-types.js';

export const OPENCODE_ADAPTER_VERSION = '0.5.0';

const GLOBAL_DIRS = ['agent', 'memory', 'skills'] as const;
const PROJECT_SUBDIRS = ['tools', 'agent', 'memory'] as const;
const TOOL_FILES = ['evokit-boot.ts', 'evokit-learn.ts', 'evokit-session.ts'] as const;
const AGENT_FILES = ['architect.md', 'reviewer.md'] as const;
const MEMORY_SEED_FILES = ['README.md', 'evokit/knowledge-index.md'] as const;

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

  // 全局 copy-dir（OpenCode 无全局 copy-dir）
  copyDirs: [],

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
  readonly description = '全局 ~/.config/opencode/（项目 .opencode/ 可选）';
  readonly version = OPENCODE_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=1.18.4';

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
    profile?: 'full' | 'minimal' | 'upgrade';
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

  /** OpenCode evokit 目录解析 —— 使用全局 ~/.config/opencode/memory/evokit/。 */
  protected override resolveEvokitDir(homeDir: string, options?: Record<string, unknown>): string {
    // 兼容旧版 opencodeDir 选项
    if (options?.opencodeDir && typeof options.opencodeDir === 'string') {
      return path.join(path.resolve(options.opencodeDir), 'memory', 'evokit');
    }
    return path.join(this.resolveHome(homeDir), 'memory', 'evokit');
  }
}

// ─── 验证 ─────────────────────────────────────────────────────

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
