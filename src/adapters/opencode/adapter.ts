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
 * 使用声明式 `AdapterLayout` + `executeLayout()` 引擎。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { BaseAdapter } from '../base-adapter.js';
import type { AdapterVerifyCheck } from '../types.js';
import type { InstallSummary, SessionEntry } from '../../core/types.js';
import type { OpenCodeAdapterOptions, OpenCodeInstallConfig } from './types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
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
const MEMORY_SEED_FILES = ['README.md'] as const;

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

// ─── 布局构建器 ────────────────────────────────────────────

/**
 * 构建 OpenCode CLI 适配器安装的声明式布局。
 *
 * OpenCode 安装到两个位置：
 *   1. 全局：~/.config/opencode/
 *   2. 项目：.opencode/ + 项目根目录文件
 *
 * 布局使用全局目录作为 targetDir；项目级
 * 文件在其 dst/dstDir 字段中使用绝对路径。
 */
export function getLayout(opts: {
  homeDir: string;
  projectDir: string;
  templateDir: string;
}): AdapterLayout {
  const { homeDir, projectDir, templateDir } = opts;
  const opencodeDir = path.join(projectDir, '.opencode');
  const opencodeTemplateDir = path.join(templateDir, 'opencode');
  const globalDir = resolveOpenCodeConfigHome(homeDir);

  const sections: AdapterSection[] = [];

  // ═══════════════════════════════════════════════════════════
  // GLOBAL INSTALL: ~/.config/opencode/
  // ═══════════════════════════════════════════════════════════

  // 1. Global directories
  sections.push({
    type: 'dirs',
    paths: [...GLOBAL_DIRS],
  });

  // 2. AGENTS.md (global, skip-if-exists, with __HOME__ replacement)
  sections.push({
    type: 'copy',
    src: path.join(opencodeTemplateDir, 'AGENTS.md'),
    dst: path.join(globalDir, 'AGENTS.md'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // 3. opencode.json (global, skip-if-exists, with __HOME__)
  sections.push({
    type: 'copy',
    src: path.join(opencodeTemplateDir, 'opencode.json'),
    dst: path.join(globalDir, 'opencode.json'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // 4. Agent definitions (global ~/.config/opencode/agent/)
  sections.push({
    type: 'merge-agents',
    srcDir: path.join(opencodeTemplateDir, 'agent'),
    dstDir: path.join(globalDir, 'agent'),
  });

  // 5. Memory seed (global, skip-if-exists)
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(opencodeTemplateDir, 'memory'),
    dstDir: path.join(globalDir, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // 6. Skills (seed, skip-if-exists per file via copy-dir)
  sections.push({
    type: 'copy-skills',
    srcDir: path.join(opencodeTemplateDir, 'skills'),
    dstDir: path.join(globalDir, 'skills'),
  });

  // ═══════════════════════════════════════════════════════════
  // PROJECT INSTALL: .opencode/  +  project root files
  // ═══════════════════════════════════════════════════════════

  // Note: Project directories are outside targetDir (globalDir).
  // They will be created by the individual sections (copy-dir, merge-agents, etc.)
  // via ensureDirSync on their dstDir. We add a dirs section for the
  // project base directory using a relative path that will be resolved
  // correctly by the engine (the engine creates targetDir at the start).

  // 8. AGENTS.md (project root, skip-if-exists, with __HOME__)
  sections.push({
    type: 'copy',
    src: path.join(opencodeTemplateDir, 'AGENTS.md'),
    dst: path.join(projectDir, 'AGENTS.md'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // 9. opencode.json (project root, skip-if-exists, with __HOME__)
  sections.push({
    type: 'copy',
    src: path.join(opencodeTemplateDir, 'opencode.json'),
    dst: path.join(projectDir, 'opencode.json'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // 10. Tools (always copy — upgrade path, with __HOME__)
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(opencodeTemplateDir, 'tools'),
    dstDir: path.join(opencodeDir, 'tools'),
    filter: '.ts',
    strategy: 'always',
    replaceHome: true,
  });

  // 11. Project-level agents (merge, path .opencode/agent/)
  sections.push({
    type: 'merge-agents',
    srcDir: path.join(opencodeTemplateDir, 'agent'),
    dstDir: path.join(opencodeDir, 'agent'),
  });

  // 12. Project-level memory seed (skip-if-exists)
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(opencodeTemplateDir, 'memory'),
    dstDir: path.join(opencodeDir, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ═══════════════════════════════════════════════════════════
  // PERMISSIONS
  // ═══════════════════════════════════════════════════════════

  // 13. Tools — readable
  sections.push({
    type: 'permissions',
    dir: path.join(opencodeDir, 'tools'),
    extension: '.ts',
    mode: 0o644,
  });

  // 14. Global memory JSONL files — 600 (personal data)
  sections.push({
    type: 'permissions',
    dir: path.join(globalDir, 'memory'),
    extension: '.jsonl',
    mode: 0o600,
  });

  return { targetDir: globalDir, sections };
}

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

  /** 构建声明式安装布局。 */
  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
  }): AdapterLayout {
    return getLayout({
      homeDir: opts.homeDir,
      projectDir: opts.projectDir || process.cwd(),
      templateDir: opts.templateDir,
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
