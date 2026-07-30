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
 * 使用声明式 `LayoutConfig` + `BaseAdapter.buildStandardLayout()` 引擎。
 * 通用安装/验证/状态/卸载管线由 BaseAdapter 提供。
 * 通用 memory/session/status API 亦由 BaseAdapter 提供。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { BaseAdapter } from '../base-adapter.js';
import type { AdapterInstallConfig, AdapterVerifyCheck, LayoutConfig } from '../types.js';
import type { AdapterLayout } from '../../core/layout-types.js';
import { CodexHooksBuilder } from './hooks.js';

export const CODEX_ADAPTER_VERSION = '0.4.0';

const CODEX_SUBDIRS = ['rules', 'hooks-scripts', 'memory'] as const;
const CODEX_PROJECT_SUBDIRS = ['rules', 'agents', 'skills', 'hooks', 'memory'] as const;
const HOOK_SCRIPTS = ['session-start.sh', 'stop.sh'] as const;
const MEMORY_SEED_FILES = ['README.md', 'learned-rules.md', 'evolution-log.md'] as const;

export function resolveCodexHome(homeDir: string): string {
  return process.env.CODEX_HOME || path.join(homeDir, '.codex');
}

// ─── 声明式布局配置 ──────────────────────────────────────────

/**
 * Codex CLI 适配器的声明式布局配置。
 * 由 BaseAdapter.buildStandardLayout() 消费，自动构建完整的 AdapterLayout。
 */
const LAYOUT_CONFIG: LayoutConfig = {
  globalDirs: [...CODEX_SUBDIRS],

  // 认知核心：AGENTS.md 放在 adapterHome 内
  cognitiveCore: {
    templateName: 'AGENTS.md',
    dstInHome: false,
    strategy: 'skip-if-exists',
    replaceHome: true,
  },

  // 配置文件：hooks.json（始终覆盖）+ config.toml（skip-if-exists）
  configFiles: [
    {
      templateName: 'hooks.json',
      targetName: 'hooks.json',
      type: 'copy',
      strategy: 'always',
      replaceHome: true,
    },
    {
      templateName: 'config.toml',
      targetName: 'config.toml',
      type: 'copy',
      strategy: 'skip-if-exists',
    },
  ],

  // copy-dir 列表
  copyDirs: [
    {
      templateName: 'rules',
      targetName: 'rules',
      filter: '.rules',
      strategy: 'always',
      counter: 'rulesInstalled',
    },
    {
      templateName: 'hooks-scripts',
      targetName: 'hooks-scripts',
      filter: '.sh',
      strategy: 'always',
      replaceHome: true,
      counter: 'hooksInstalled',
    },
  ],

  // seed-memory
  seedMemory: { templateName: 'memory', files: [...MEMORY_SEED_FILES] },

  // 全局权限
  permissions: [
    { dir: 'hooks-scripts', extension: '.sh', mode: 0o755 },
    { dir: 'memory', extension: '.jsonl', mode: 0o600 },
  ],

  // 项目级配置
  project: {
    configFiles: [
      {
        templateName: 'config.toml',
        targetName: 'config.toml',
        type: 'copy',
        strategy: 'skip-if-exists',
      },
    ],
    copyDirs: [
      {
        templateName: 'rules',
        targetName: 'rules',
        filter: '.rules',
        strategy: 'always',
        counter: 'rulesInstalled',
      },
      {
        templateName: 'hooks-scripts',
        targetName: 'hooks',
        filter: '.sh',
        strategy: 'always',
        replaceHome: true,
        counter: 'hooksInstalled',
      },
    ],
    mergeAgents: { templateName: 'agents', targetName: 'agents' },
    copySkills: { templateName: 'skills', targetName: 'skills' },
    seedMemory: { templateName: 'memory', files: [...MEMORY_SEED_FILES] },
    permissions: [{ dir: 'hooks', extension: '.sh', mode: 0o755 }],
  },
};

// ─── BaseAdapter 子类实现 ──────────────────────────────────

export class CodexAdapter extends BaseAdapter {
  readonly id = 'codex';
  readonly label = 'Codex CLI';
  readonly description = '~/.codex/ + .codex/';
  readonly version = CODEX_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=0.145.0';

  /** 项目级配置目录名 */
  protected override get projectSubdir(): string {
    return '.codex';
  }

  /** 解析 Codex 全局安装目录（支持 CODEX_HOME 环境变量覆盖）。 */
  override resolveHome(homeDir: string): string {
    return resolveCodexHome(homeDir);
  }

  /** 构建声明式安装布局，委托给 buildStandardLayout()。 */
  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
    allowWorkflow?: boolean;
    profile?: 'full' | 'minimal' | 'upgrade';
  }): AdapterLayout {
    return this.buildStandardLayout(LAYOUT_CONFIG, opts);
  }

  /** 验证检查项，委托给公共 verifyCodexInstallation() 函数。 */
  protected verifyChecks(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    const codexHome = resolveCodexHome(config.homeDir);
    return verifyCodexInstallation(codexHome, config.projectDir);
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
        // Windows 没有 Unix 权限位概念，fs.statSync().mode & 0o111 始终为 0。
        // 在 Windows 上跳过可执行位检查（文件由 EvoKit 安装，理应可执行）。
        const executable = process.platform === 'win32' || (fs.statSync(sp).mode & 0o111) !== 0;
        checks.push({
          name: `.codex/hooks-scripts/${script}`,
          pass: executable,
          detail: executable ? undefined : '不可执行',
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
