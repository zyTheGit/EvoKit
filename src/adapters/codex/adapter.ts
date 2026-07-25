/**
 * EvoKit — Codex CLI 适配器安装器
 *
 * @internal — Codex CLI 的适配器实现。CodexAdapter 继承 BaseAdapter 基类。
 *
 * 实现 OpenAI Codex CLI 的 AgentAdapter 接口。
 * Codex CLI 使用 ~/.codex/，包含：
 * - AGENTS.md 作为认知核心（类似于 CLAUDE.md）
 * - hooks.json 用于生命周期钩子（SessionStart、Stop、PreToolUse）
 * - config.toml 用于配置
 * - .codex/rules/ 用于 Starlark 权限规则
 * - ~/.codex/memory/ 用于进化数据
 *
 * 使用声明式 `AdapterLayout` + `executeLayout()` 引擎。
 * 通用安装/验证/状态/卸载管线由 BaseAdapter 提供。
 * 通用 memory/session/status API 亦由 BaseAdapter 提供。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { BaseAdapter } from '../base-adapter.js';
import type { AdapterInstallConfig, AdapterVerifyCheck } from '../types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
import { CodexHooksBuilder } from './hooks.js';

export const CODEX_ADAPTER_VERSION = '0.4.0';

const CODEX_SUBDIRS = ['rules', 'hooks-scripts', 'memory'] as const;
const CODEX_PROJECT_SUBDIRS = ['rules', 'agents', 'skills', 'hooks', 'memory'] as const;
const HOOK_SCRIPTS = ['session-start.sh', 'stop.sh', 'pre-tool-use.sh'] as const;
const MEMORY_SEED_FILES = ['README.md', 'learned-rules.md', 'evolution-log.md'] as const;

export function resolveCodexHome(homeDir: string): string {
  return process.env.CODEX_HOME || path.join(homeDir, '.codex');
}

// ─── 布局构建器 ────────────────────────────────────────────

/**
 * 构建 Codex CLI 适配器安装的声明式布局。
 *
 * 支持双层安装：
 *   1. 全局：~/.codex/
 *   2. 项目（可选）：.codex/ + 项目根目录文件
 *
 * 布局使用全局目录作为 targetDir；项目级
 * 文件在其 dst/dstDir 字段中使用绝对路径。
 */
export function getLayout(opts: {
  homeDir: string;
  projectDir?: string;
  templateDir: string;
}): AdapterLayout {
  const { homeDir, projectDir, templateDir } = opts;
  const codexHome = resolveCodexHome(homeDir);
  const codexTemplateDir = path.join(templateDir, 'codex');

  const sections: AdapterSection[] = [];

  // ── 1. 目录 ──────────────────────────────────────────
  sections.push({
    type: 'dirs',
    paths: [...CODEX_SUBDIRS],
  });

  // ── 2. AGENTS.md（skip-if-exists，替换 __HOME__）──
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'AGENTS.md'),
    dst: path.join(codexHome, 'AGENTS.md'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // ── 3. hooks.json（始终复制 — 升级路径，替换 __HOME__）──
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'hooks.json'),
    dst: path.join(codexHome, 'hooks.json'),
    strategy: 'always',
    replaceHome: true,
  });

  // ── 4. config.toml（skip-if-exists，不替换 __HOME__）──
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'config.toml'),
    dst: path.join(codexHome, 'config.toml'),
    strategy: 'skip-if-exists',
  });

  // ── 5. Rules（始终复制 — 升级路径）────────────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(codexTemplateDir, 'rules'),
    dstDir: path.join(codexHome, 'rules'),
    filter: '.rules',
    strategy: 'always',
    counter: 'rulesInstalled',
  });

  // ── 6. Hook 脚本（始终复制，替换 __HOME__）──────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(codexTemplateDir, 'hooks-scripts'),
    dstDir: path.join(codexHome, 'hooks-scripts'),
    filter: '.sh',
    strategy: 'always',
    replaceHome: true,
    counter: 'hooksInstalled',
  });

  // ── 7. Memory 初始化（skip-if-exists）────────────────────
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(codexTemplateDir, 'memory'),
    dstDir: path.join(codexHome, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ═══════════════════════════════════════════════════════════
  // PROJECT INSTALL (optional): .codex/  +  project root files
  // ═══════════════════════════════════════════════════════════

  if (projectDir) {
    const codexProjectDir = path.join(projectDir, '.codex');

    // 8. AGENTS.md (project root, skip-if-exists, with __HOME__)
    sections.push({
      type: 'copy',
      src: path.join(codexTemplateDir, 'AGENTS.md'),
      dst: path.join(projectDir, 'AGENTS.md'),
      strategy: 'skip-if-exists',
      replaceHome: true,
    });

    // 9. config.toml (project-level, skip-if-exists)
    sections.push({
      type: 'copy',
      src: path.join(codexTemplateDir, 'config.toml'),
      dst: path.join(codexProjectDir, 'config.toml'),
      strategy: 'skip-if-exists',
    });

    // 10. Rules (project-level, copy-dir)
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(codexTemplateDir, 'rules'),
      dstDir: path.join(codexProjectDir, 'rules'),
      filter: '.rules',
      strategy: 'always',
      counter: 'rulesInstalled',
    });

    // 11. Agents (project-level, merge-agents)
    sections.push({
      type: 'merge-agents',
      srcDir: path.join(codexTemplateDir, 'agents'),
      dstDir: path.join(codexProjectDir, 'agents'),
    });

    // 12. Skills (project-level, copy-skills)
    sections.push({
      type: 'copy-skills',
      srcDir: path.join(codexTemplateDir, 'skills'),
      dstDir: path.join(codexProjectDir, 'skills'),
    });

    // 13. Hooks (project-level, copy-dir)
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(codexTemplateDir, 'hooks-scripts'),
      dstDir: path.join(codexProjectDir, 'hooks'),
      filter: '.sh',
      strategy: 'always',
      replaceHome: true,
      counter: 'hooksInstalled',
    });

    // 14. Memory seed (project-level, skip-if-exists)
    sections.push({
      type: 'seed-memory',
      srcDir: path.join(codexTemplateDir, 'memory'),
      dstDir: path.join(codexProjectDir, 'memory'),
      files: [...MEMORY_SEED_FILES],
    });
  }

  // ── 15. 权限 ─────────────────────────────────────────────
  sections.push({
    type: 'permissions',
    dir: path.join(codexHome, 'hooks-scripts'),
    extension: '.sh',
    mode: 0o755,
  });

  // ── 16. Memory JSONL 文件权限（个人数据）──────────────
  sections.push({
    type: 'permissions',
    dir: path.join(codexHome, 'memory'),
    extension: '.jsonl',
    mode: 0o600,
  });

  // ── 17. 项目级 Hook 脚本权限 ──────────────────────────────
  if (projectDir) {
    sections.push({
      type: 'permissions',
      dir: path.join(projectDir, '.codex', 'hooks'),
      extension: '.sh',
      mode: 0o755,
    });
  }

  return { targetDir: codexHome, sections };
}

// ─── BaseAdapter 子类实现 ──────────────────────────────────

export class CodexAdapter extends BaseAdapter {
  readonly id = 'codex';
  readonly label = 'Codex CLI';
  readonly description = '~/.codex/ + .codex/';
  readonly version = CODEX_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=1.0.0';

  /** 项目级配置目录名 */
  protected override get projectSubdir(): string {
    return '.codex';
  }

  /** 解析 Codex 全局安装目录（支持 CODEX_HOME 环境变量覆盖）。 */
  override resolveHome(homeDir: string): string {
    return resolveCodexHome(homeDir);
  }

  /** 构建声明式安装布局，委托给公共 getLayout() 函数。 */
  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
    allowWorkflow?: boolean;
  }): AdapterLayout {
    return getLayout(opts);
  }

  /** 验证检查项，委托给公共 verifyCodexInstallation() 函数。 */
  protected verifyChecks(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    const codexHome = resolveCodexHome(config.homeDir);
    return verifyCodexInstallation(codexHome, config.projectDir);
  }

  /** Codex 状态检查 —— 包含 hooks、config.toml、rules 等特有字段。 */
  override getStatus(homeDir: string): {
    installed: boolean;
    adapterHome: string;
    agentsPresent: boolean;
    hooksPresent: boolean;
    configPresent: boolean;
    sharedMemoryPresent: boolean;
    ruleCount: number;
    error?: string;
  } {
    const codexHome = resolveCodexHome(homeDir);
    const result = {
      installed: false,
      adapterHome: codexHome,
      agentsPresent: false,
      hooksPresent: false,
      configPresent: false,
      sharedMemoryPresent: false,
      ruleCount: 0,
    };

    try {
      result.agentsPresent = fse.existsSync(path.join(codexHome, 'AGENTS.md'));
      result.hooksPresent = fse.existsSync(path.join(codexHome, 'hooks.json'));
      result.configPresent = fse.existsSync(path.join(codexHome, 'config.toml'));

      const rulesDir = path.join(codexHome, 'rules');
      if (fse.existsSync(rulesDir)) {
        result.ruleCount = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.rules')).length;
      }

      const memDir = path.join(homeDir, '.codex', 'memory');
      result.sharedMemoryPresent = fse.existsSync(memDir);

      result.installed = result.agentsPresent || result.hooksPresent || result.configPresent;
    } catch (e) {
      return { ...result, error: (e as Error).message };
    }

    return result;
  }
}

// ─── 钩子辅助函数 ──────────────────────────────────────────

/**
 * 设置 Codex CLI 的生命周期钩子。
 * 生成包含 SessionStart、Stop 和 PreToolUse 处理器的 hooks.json。
 */
export function setupCodexHooks(
  codexHome: string,
  options: import('./types.js').CodexAdapterOptions = {},
): void {
  const scriptsDir = options.codexHome
    ? path.resolve(options.codexHome, 'hooks-scripts')
    : path.resolve(codexHome, 'hooks-scripts');

  // 使用默认钩子配置
  const builder = CodexHooksBuilder.createDefault(scriptsDir);

  // 写入 hooks.json
  const hooksPath = path.join(codexHome, 'hooks.json');
  builder.writeToFile(hooksPath);
}

// ─── 验证 ─────────────────────────────────────────────────

/**
 * Codex CLI 安装的完整启动验证。
 */
export function verifyCodexSetup(
  homeDir: string,
  _options: import('./types.js').CodexAdapterOptions = {},
): import('../../core/types.js').VerifyResult[] {
  const codexHome = resolveCodexHome(homeDir);
  const checks = verifyCodexInstallation(codexHome);
  const results: import('../../core/types.js').VerifyResult[] = [];

  for (const check of checks) {
    results.push({
      check: check.name,
      status: check.pass ? 'pass' : 'fail',
      detail: check.detail,
    });
  }

  return results;
}

/**
 * 验证指定路径下的 Codex CLI 安装（全局 + 可选项目级）。
 * 独立 API 使用的公共包装函数。
 */
export function verifyCodexInstallation(
  codexHome: string,
  projectDir?: string,
): AdapterVerifyCheck[] {
  const checks: AdapterVerifyCheck[] = [];

  for (const file of ['AGENTS.md', 'hooks.json', 'config.toml']) {
    const exists = fse.existsSync(path.join(codexHome, file));
    checks.push({
      name: `.codex/${file}`,
      pass: exists,
      detail: exists ? undefined : '文件缺失',
    });
  }

  for (const subdir of CODEX_SUBDIRS) {
    const exists = fse.existsSync(path.join(codexHome, subdir));
    checks.push({
      name: `.codex/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : '目录缺失',
    });
  }

  const hooksDir = path.join(codexHome, 'hooks-scripts');
  if (fse.existsSync(hooksDir)) {
    for (const script of HOOK_SCRIPTS) {
      const sp = path.join(hooksDir, script);
      const exists = fse.existsSync(sp);
      if (exists) {
        const stats = fs.statSync(sp);
        checks.push({
          name: `.codex/hooks-scripts/${script}`,
          pass: (stats.mode & 0o111) !== 0,
          detail: (stats.mode & 0o111) !== 0 ? undefined : '不可执行',
        });
      } else {
        checks.push({
          name: `.codex/hooks-scripts/${script}`,
          pass: false,
          detail: '脚本缺失',
        });
      }
    }
  }

  // ── 项目级检查（可选）──
  if (projectDir) {
    const codexProjectDir = path.join(projectDir, '.codex');

    // 项目根 AGENTS.md
    const projectAgentsMdExists = fse.existsSync(path.join(projectDir, 'AGENTS.md'));
    checks.push({
      name: 'AGENTS.md (project root)',
      pass: projectAgentsMdExists,
      detail: projectAgentsMdExists ? undefined : '文件缺失',
    });

    // 项目级 config.toml
    checks.push({
      name: '.codex/config.toml (project)',
      pass: fse.existsSync(path.join(codexProjectDir, 'config.toml')),
    });

    // 项目级子目录
    for (const subdir of CODEX_PROJECT_SUBDIRS) {
      const exists = fse.existsSync(path.join(codexProjectDir, subdir));
      checks.push({
        name: `.codex/${subdir}/ (project)`,
        pass: exists,
        detail: exists ? undefined : '目录缺失',
      });
    }
  }

  return checks;
}
