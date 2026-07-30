/**
 * EvoKit — Claude Code 适配器安装器
 *
 * @internal — Claude Code 的适配器实现。继承 BaseAdapter 基类，
 * 仅声明 Claude 特有的路径解析、布局配置和验证逻辑。
 *
 * 将 EvoKit 模板文件安装到 ~/.claude/（全局）+ .claude/（项目级，可选），包含完整流水线：
 * CLAUDE.md、settings.json 合并、hooks、rules、commands、agents、
 * skills 以及 memory 初始化。
 *
 * 使用声明式 `LayoutConfig` + `BaseAdapter.buildStandardLayout()` 引擎，
 * 替代手写的 getLayout() 函数。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

import type {
  AdapterInstallConfig,
  AdapterStatus,
  AdapterVerifyCheck,
  LayoutConfig,
} from '../types.js';
import type { AdapterLayout } from '../../core/layout-types.js';
import type { HeuristicConfig } from '../base-adapter.js';
import { BaseAdapter } from '../base-adapter.js';
import { getFileLineCount } from '../../core/memory.js';

export const CLAUDE_ADAPTER_VERSION = '0.2.0';

// ─── 常量 ─────────────────────────────────────────────────

const CLAUDE_GLOBAL_SUBDIRS = ['rules', 'commands', 'agents', 'hooks', 'memory', 'skills'] as const;
const CLAUDE_PROJECT_SUBDIRS = ['rules', 'commands', 'agents', 'skills', 'memory'] as const;
const CLAUDE_HOOK_FILES = ['session-start.sh', 'stop.sh'] as const;

const MEMORY_SEED_FILES = [
  'README.md',
  'learned-rules.md',
  'evolution-log.md',
  'corrections.jsonl',
  'observations.jsonl',
  'violations.jsonl',
  'sessions.jsonl',
] as const;

// ─── 声明式布局配置 ──────────────────────────────────────────

/**
 * Claude Code 适配器的声明式布局配置。
 * 由 BaseAdapter.buildStandardLayout() 消费，自动构建完整的 AdapterLayout。
 */
const LAYOUT_CONFIG: LayoutConfig = {
  globalDirs: [...CLAUDE_GLOBAL_SUBDIRS],

  // 认知核心：CLAUDE.md 放在 homeDir 根目录（而非 adapterHome 内）
  cognitiveCore: {
    templateName: 'CLAUDE.md',
    dstInHome: true,
    strategy: 'skip-if-exists',
    appendMarker: 'EvoKit — 项目上下文引擎',
  },

  // 额外全局文件：MEMORY.md
  extraGlobalCopies: [{ templateName: 'MEMORY.md', targetName: 'MEMORY.md', strategy: 'always' }],

  // 配置文件：settings.json（深度合并）
  configFiles: [
    {
      templateName: 'settings.json',
      targetName: 'settings.json',
      type: 'merge-settings',
      replaceHome: true,
      allowWorkflow: true,
    },
  ],

  // copy-dir 列表
  copyDirs: [
    {
      templateName: 'hooks',
      targetName: 'hooks',
      strategy: 'always',
      replaceHome: true,
      counter: 'hooksInstalled',
    },
    {
      templateName: 'rules',
      targetName: 'rules',
      filter: '.md',
      strategy: 'always',
      counter: 'rulesInstalled',
    },
    {
      templateName: 'commands',
      targetName: 'commands',
      filter: '.md',
      strategy: 'always',
      counter: 'commandsInstalled',
    },
  ],

  // merge-agents
  mergeAgents: { templateName: 'agents', targetName: 'agents' },

  // copy-skills
  copySkills: { templateName: 'skills', targetName: 'skills' },

  // seed-memory
  seedMemory: { templateName: 'memory', files: [...MEMORY_SEED_FILES] },

  // 全局权限
  permissions: [
    { dir: 'hooks', extension: '.sh', mode: 0o755 },
    { dir: 'memory', extension: '.jsonl', mode: 0o600 },
  ],

  // 项目级配置
  project: {
    configFiles: [
      {
        templateName: 'settings.json',
        targetName: 'settings.json',
        type: 'merge-settings',
        replaceHome: true,
      },
    ],
    copyDirs: [
      {
        templateName: 'rules',
        targetName: 'rules',
        filter: '.md',
        strategy: 'always',
        counter: 'rulesInstalled',
      },
      {
        templateName: 'commands',
        targetName: 'commands',
        filter: '.md',
        strategy: 'always',
        counter: 'commandsInstalled',
      },
    ],
    mergeAgents: { templateName: 'agents', targetName: 'agents' },
    copySkills: { templateName: 'skills', targetName: 'skills' },
    seedMemory: { templateName: 'memory', files: [...MEMORY_SEED_FILES] },
  },
};

// ─── ClaudeAdapter ─────────────────────────────────────

export class ClaudeAdapter extends BaseAdapter {
  readonly id = 'claude';
  readonly label = 'Claude Code';
  readonly description = '~/.claude/ + .claude/';
  readonly version = CLAUDE_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=2.1.220';

  // ── BaseAdapter 抽象实现 ──

  protected override get templateEntryPoint(): string {
    return 'CLAUDE.md';
  }

  protected override get projectSubdir(): string {
    return '.claude';
  }

  resolveHome(homeDir: string): string {
    return path.join(homeDir, '.claude');
  }

  // ── 卸载相关覆盖 ──

  override getHeuristicConfig(adapterHome: string): HeuristicConfig {
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

  override reverseMergesSettings(): boolean {
    return true;
  }

  override cognitiveCoreAppendMarker(): string | null {
    return 'EvoKit — 项目上下文引擎';
  }

  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
    allowWorkflow?: boolean;
    profile?: 'full' | 'minimal' | 'upgrade';
  }): AdapterLayout {
    return this.buildStandardLayout(LAYOUT_CONFIG, opts);
  }

  protected verifyChecks(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return verifyClaudeInstallation(config.homeDir, config.projectDir);
  }

  /**
   * Claude 特有的状态检查 —— 在通用检查基础上增加：
   * 1. CLAUDE.md 行数限制检查（≤150 行）
   * 2. 记忆文件完整性检查
   *
   * 这些检查原本硬编码在 doctor 命令中（if installer.id === 'claude'），
   * 现在移入适配器自身，消除抽象泄漏。
   */
  override status(config: AdapterInstallConfig): AdapterStatus {
    const baseStatus = super.status(config);
    const extraChecks = buildClaudeExtraChecks(config.homeDir);
    const allPass = baseStatus.allPass && extraChecks.every((c) => c.pass);

    return {
      ...baseStatus,
      allPass,
      extraChecks,
    };
  }
}

// ─── 验证 ─────────────────────────────────────────────

/**
 * 验证 Claude Code EvoKit 安装（全局 + 可选项目级）。
 */
export function verifyClaudeInstallation(
  homeDir: string,
  projectDir?: string,
): AdapterVerifyCheck[] {
  const claudeDir = path.join(homeDir, '.claude');
  const checks: AdapterVerifyCheck[] = [];

  // ── 全局检查 ──

  // 目录结构
  for (const subdir of CLAUDE_GLOBAL_SUBDIRS) {
    const exists = fse.existsSync(path.join(claudeDir, subdir));
    checks.push({
      name: `.claude/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : '目录不存在',
    });
  }

  // 关键文件
  const keyFiles = [
    { name: 'CLAUDE.md', path: path.join(homeDir, 'CLAUDE.md') },
    { name: '.claude/MEMORY.md', path: path.join(claudeDir, 'MEMORY.md') },
    { name: '.claude/settings.json', path: path.join(claudeDir, 'settings.json') },
  ];
  for (const { name, path: fp } of keyFiles) {
    const exists = fse.existsSync(fp);
    checks.push({
      name,
      pass: exists,
      detail: exists ? undefined : '文件缺失',
    });
  }

  // Hook 可执行文件
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fse.existsSync(hooksDir)) {
    for (const hook of CLAUDE_HOOK_FILES) {
      const hp = path.join(hooksDir, hook);
      const exists = fse.existsSync(hp);
      if (exists) {
        // Windows 没有 Unix 权限位概念，fs.statSync().mode & 0o111 始终为 0。
        // 在 Windows 上跳过可执行位检查（文件由 EvoKit 安装，理应可执行）。
        const executable = process.platform === 'win32' || !!(fs.statSync(hp).mode & 0o111);
        checks.push({
          name: `.claude/hooks/${hook}`,
          pass: executable,
          detail: executable ? undefined : '不可执行',
        });
      }
    }
  }

  // ── 项目级检查（可选）──
  if (projectDir) {
    const claudeProjectDir = path.join(projectDir, '.claude');

    // 项目根 CLAUDE.md
    const projectClaudeMdExists = fse.existsSync(path.join(projectDir, 'CLAUDE.md'));
    checks.push({
      name: 'CLAUDE.md (project root)',
      pass: projectClaudeMdExists,
      detail: projectClaudeMdExists ? undefined : '文件缺失',
    });

    // 项目级 settings.json
    checks.push({
      name: '.claude/settings.json (project)',
      pass: fse.existsSync(path.join(claudeProjectDir, 'settings.json')),
    });

    // 项目级子目录
    for (const subdir of CLAUDE_PROJECT_SUBDIRS) {
      const exists = fse.existsSync(path.join(claudeProjectDir, subdir));
      checks.push({
        name: `.claude/${subdir}/ (project)`,
        pass: exists,
        detail: exists ? undefined : '目录缺失',
      });
    }
  }

  return checks;
}

// ─── 向后兼容导出 ──────────────────────────────────────────

/**
 * @deprecated 使用 ClaudeAdapter.buildLayout() 或 buildStandardLayout() 代替。
 * 保留此函数仅为向后兼容（独立 API 和测试可能直接调用）。
 */
export function getLayout(opts: {
  homeDir: string;
  projectDir?: string;
  templateDir: string;
  allowWorkflow?: boolean;
}): AdapterLayout {
  // 使用临时适配器实例构建布局，保持与原 getLayout 完全一致的行为
  const adapter = new ClaudeAdapter();
  return adapter.buildStandardLayout(LAYOUT_CONFIG, opts);
}

// ─── Claude 特有的额外检查 ──────────────────────────────────────

/**
 * 构建 Claude 适配器特有的额外检查项。
 *
 * 这些检查原本硬编码在 doctor 命令中（`if installer.id === 'claude'`），
 * 现在移入适配器自身，通过 `status().extraChecks` 暴露，
 * doctor 命令只需遍历 extraChecks 即可，无需硬编码任何适配器特有逻辑。
 *
 * @param homeDir 用户主目录
 * @returns 额外验证检查项数组
 */
export function buildClaudeExtraChecks(homeDir: string): AdapterVerifyCheck[] {
  const checks: AdapterVerifyCheck[] = [];

  // CLAUDE.md 行数限制检查（≤150 行）
  const rootClaudeMd = path.join(homeDir, 'CLAUDE.md');
  if (fse.existsSync(rootClaudeMd)) {
    const lines = getFileLineCount(rootClaudeMd);
    checks.push({
      name: 'CLAUDE.md 行数限制',
      pass: lines <= 150,
      detail: lines > 150 ? `${lines} 行（限制：150）` : `${lines}/150 行`,
    });
  }

  // 记忆文件完整性检查
  const memoryDir = path.join(homeDir, '.claude', 'memory');
  const memoryFiles = [
    'corrections.jsonl',
    'observations.jsonl',
    'sessions.jsonl',
    'violations.jsonl',
    'learned-rules.md',
    'evolution-log.md',
    'README.md',
  ];

  for (const file of memoryFiles) {
    const fp = path.join(memoryDir, file);
    const exists = fse.existsSync(fp);
    checks.push({
      name: `.claude/memory/${file}`,
      pass: exists || file === 'README.md', // README.md 为可选
      detail: !exists && file !== 'README.md' ? '（可选）' : undefined,
    });
  }

  return checks;
}
