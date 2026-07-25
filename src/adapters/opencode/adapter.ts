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
 * 通用 memory/session/status API 由 BaseAdapter 提供。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { BaseAdapter, type HeuristicConfig } from '../base-adapter.js';
import type { AdapterVerifyCheck } from '../types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';

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

  /** OpenCode memory 目录解析 —— 使用全局 ~/.config/opencode/memory/。 */
  protected override resolveMemoryDir(homeDir: string, options?: Record<string, unknown>): string {
    // 兼容旧版 opencodeDir 选项
    if (options?.opencodeDir && typeof options.opencodeDir === 'string') {
      return path.join(path.resolve(options.opencodeDir), 'memory');
    }
    return path.join(this.resolveHome(homeDir), 'memory');
  }

  /** OpenCode 状态检查 —— 包含 tools、agentCount 等特有字段。 */
  override getStatus(homeDir: string): {
    installed: boolean;
    adapterHome: string;
    agentsPresent: boolean;
    configPresent: boolean;
    toolsPresent: boolean;
    memoryPresent: boolean;
    agentCount: number;
    error?: string;
  } {
    const globalDir = this.resolveHome(homeDir);
    const result = {
      installed: false,
      adapterHome: globalDir,
      agentsPresent: false,
      configPresent: false,
      toolsPresent: false,
      memoryPresent: false,
      agentCount: 0,
    };

    try {
      // 检查全局配置
      result.agentsPresent = fse.existsSync(path.join(globalDir, 'AGENTS.md'));
      result.configPresent = fse.existsSync(path.join(globalDir, 'opencode.json'));

      // 检查全局 agents
      const globalAgentDir = path.join(globalDir, 'agent');
      if (fse.existsSync(globalAgentDir)) {
        result.agentCount = fs.readdirSync(globalAgentDir).filter((f) => f.endsWith('.md')).length;
      }

      // 检查全局 memory
      result.memoryPresent = fse.existsSync(path.join(globalDir, 'memory'));

      result.installed = result.agentsPresent || result.configPresent;
    } catch (e) {
      return { ...result, error: (e as Error).message };
    }

    return result;
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
