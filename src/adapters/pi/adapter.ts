/**
 * EvoKit — Pi CLI 适配器
 *
 * @internal — Pi CLI 的适配器实现。PiAdapter 类继承 BaseAdapter 基类。
 *
 * 为 Pi CLI 实现 BaseAdapter 抽象成员。
 * Pi CLI 使用：
 * - AGENTS.md 作为 L1 认知核心（全局 ~/.pi/agent/ + 项目级）
 * - ~/.pi/agent/settings.json 作为全局配置（JSON 格式）
 * - ~/.pi/agent/extensions/ 作为全局 TypeScript 扩展（通过 pi.on() 事件订阅）
 * - ~/.pi/agent/skills/ 作为全局 Skills（遵循 Agent Skills 标准）
 * - ~/.pi/agent/memory/ 作为全局学习数据
 * - .pi/ 作为项目级配置
 *
 * Pi CLI 没有内置 hooks 系统 — 生命周期逻辑通过 TypeScript 扩展实现。
 *
 * 使用声明式 `LayoutConfig` + `BaseAdapter.buildStandardLayout()` 引擎。
 * 通用 memory/session/status API 亦由 BaseAdapter 提供。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { type AdapterInstallConfig, type AdapterVerifyCheck, type LayoutConfig } from '../types.js';
import { BaseAdapter } from '../base-adapter.js';
import type { AdapterLayout } from '../../core/layout-types.js';

export const PI_ADAPTER_VERSION = '0.6.0';

// ─── 常量 ─────────────────────────────────────────────────

const GLOBAL_DIRS = ['extensions', 'memory', 'skills', 'agent', 'prompts'] as const;
const EXTENSION_FILES = [
  'evokit-lifecycle.ts',
  'evokit-boot.ts',
  'evokit-evolve.ts',
  'evokit-memory.ts',
  'evokit-session.ts',
] as const;
const AGENT_FILES = ['architect.md', 'reviewer.md'] as const;
const MEMORY_SEED_FILES = ['README.md', 'learned-rules.md', 'evolution-log.md'] as const;

// ─── 路径解析 ──────────────────────────────────────────────

/**
 * 解析 Pi CLI 全局配置目录。
 * 遵循 PI_CODING_AGENT_DIR 环境变量，默认为 ~/.pi/agent/。
 */
export function resolvePiHome(homeDir: string): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(homeDir, '.pi', 'agent');
}

/**
 * 解析 Pi CLI 项目级配置目录。
 */
export function resolvePiProjectDir(projectDir: string): string {
  return path.join(projectDir, '.pi');
}

// ─── 声明式布局配置 ──────────────────────────────────────────

/**
 * Pi CLI 适配器的声明式布局配置。
 * 由 BaseAdapter.buildStandardLayout() 消费，自动构建完整的 AdapterLayout。
 */
const LAYOUT_CONFIG: LayoutConfig = {
  globalDirs: [...GLOBAL_DIRS],

  // 认知核心：AGENTS.md 放在 adapterHome 内
  cognitiveCore: {
    templateName: 'AGENTS.md',
    dstInHome: false,
    strategy: 'skip-if-exists',
    replaceHome: true,
  },

  // 配置文件：settings.json（skip-if-exists，copy 方式）
  configFiles: [
    {
      templateName: 'settings.json',
      targetName: 'settings.json',
      type: 'copy',
      strategy: 'skip-if-exists',
      replaceHome: true,
    },
  ],

  // copy-dir 列表
  copyDirs: [
    {
      templateName: 'extensions',
      targetName: 'extensions',
      filter: '.ts',
      strategy: 'always',
      replaceHome: true,
      counter: 'hooksInstalled',
    },
  ],

  // merge-agents
  mergeAgents: { templateName: 'agent', targetName: 'agent' },

  // copy-skills
  copySkills: { templateName: 'skills', targetName: 'skills' },

  // seed-memory
  seedMemory: { templateName: 'memory', files: [...MEMORY_SEED_FILES] },

  // 全局权限
  permissions: [
    { dir: 'extensions', extension: '.ts', mode: 0o644 },
    { dir: 'memory', extension: '.jsonl', mode: 0o600 },
  ],

  // 项目级配置
  project: {
    // Pi 的项目级 settings.json 放在 projectDir 根目录（而非 .pi/ 内）
    configFiles: [
      {
        templateName: 'settings.json',
        targetName: 'settings.json',
        type: 'copy',
        strategy: 'skip-if-exists',
        replaceHome: true,
        dstInProjectRoot: true,
      },
    ],
    copyDirs: [
      {
        templateName: 'extensions',
        targetName: 'extensions',
        filter: '.ts',
        strategy: 'always',
        replaceHome: true,
      },
    ],
  },
};

// ─── BaseAdapter 实现 ──────────────────────────────────────

export class PiAdapter extends BaseAdapter {
  readonly id = 'pi';
  readonly label = 'Pi CLI';
  readonly description = '~/.pi/agent/';
  readonly version = PI_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=0.82.0';

  protected get projectSubdir(): string {
    return '.pi';
  }

  resolveHome(homeDir: string): string {
    return resolvePiHome(homeDir);
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
    return verifyPiInstallation(resolvePiHome(config.homeDir));
  }

  /** Pi 状态检查 —— 包含 extensions、skills 等特有字段。 */
  override getStatus(homeDir: string): {
    installed: boolean;
    adapterHome: string;
    agentsPresent: boolean;
    configPresent: boolean;
    memoryPresent: boolean;
    extensionsPresent: boolean;
    skillsPresent: boolean;
    sharedMemoryPresent: boolean;
    extensionCount: number;
    error?: string;
  } {
    const piHome = resolvePiHome(homeDir);
    const result = {
      installed: false,
      adapterHome: piHome,
      agentsPresent: false,
      configPresent: false,
      memoryPresent: false,
      extensionsPresent: false,
      skillsPresent: false,
      sharedMemoryPresent: false,
      extensionCount: 0,
    };

    try {
      result.agentsPresent = fse.existsSync(path.join(piHome, 'AGENTS.md'));
      result.configPresent = fse.existsSync(path.join(piHome, 'settings.json'));

      const extDir = path.join(piHome, 'extensions');
      if (fse.existsSync(extDir)) {
        const exts = fs.readdirSync(extDir).filter((f) => f.endsWith('.ts'));
        result.extensionCount = exts.length;
        result.extensionsPresent = exts.length > 0;
      }

      result.skillsPresent = fse.existsSync(path.join(piHome, 'skills'));

      const memDir = path.join(piHome, 'memory');
      result.memoryPresent = fse.existsSync(memDir);
      result.sharedMemoryPresent = fse.existsSync(memDir);

      result.installed = result.agentsPresent || result.configPresent || result.extensionsPresent;
    } catch (e) {
      return { ...result, error: (e as Error).message };
    }

    return result;
  }
}

// ─── 验证 ─────────────────────────────────────────────────

/**
 * 验证指定路径下的 Pi CLI EvoKit 安装。
 */
export function verifyPiInstallation(piHome: string): AdapterVerifyCheck[] {
  const checks: AdapterVerifyCheck[] = [];

  // 全局配置文件
  for (const file of ['AGENTS.md', 'settings.json']) {
    const exists = fse.existsSync(path.join(piHome, file));
    checks.push({
      name: `~/.pi/agent/${file}`,
      pass: exists,
      detail: exists ? undefined : '文件缺失',
    });
  }

  // 全局子目录
  for (const subdir of GLOBAL_DIRS) {
    const exists = fse.existsSync(path.join(piHome, subdir));
    checks.push({
      name: `~/.pi/agent/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : '目录缺失',
    });
  }

  // 扩展文件
  const extDir = path.join(piHome, 'extensions');
  if (fse.existsSync(extDir)) {
    for (const extFile of EXTENSION_FILES) {
      const exists = fse.existsSync(path.join(extDir, extFile));
      checks.push({
        name: `~/.pi/agent/extensions/${extFile}`,
        pass: exists,
        detail: exists ? undefined : '扩展缺失',
      });
    }
  }

  // Agent 文件（全局）
  const agentDir = path.join(piHome, 'agent');
  if (fse.existsSync(agentDir)) {
    for (const agentFile of AGENT_FILES) {
      const exists = fse.existsSync(path.join(agentDir, agentFile));
      checks.push({
        name: `~/.pi/agent/agent/${agentFile}`,
        pass: exists,
        detail: exists ? undefined : '代理定义缺失',
      });
    }
  }

  // 全局 memory 目录
  const memDir = path.join(piHome, 'memory');
  checks.push({
    name: `~/.pi/agent/memory/`,
    pass: true,
    detail: fse.existsSync(memDir) ? undefined : '尚未创建（首次写入记忆时自动创建）',
  });

  return checks;
}
