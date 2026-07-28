/**
 * EvoKit — 反向布局启发式辅助函数
 *
 * 提供适配器查询、虚拟 manifest 构建、启发式 agent 记录等辅助功能，
 * 供 reverse-layout-builder.ts 在清单缺失时构建反向布局。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

import { getAdapterInternal } from '../adapters/registry.js';
import type { AdapterInternal } from '../adapters/types.js';
import type { HeuristicConfig } from '../adapters/base-adapter.js';
import type { AdapterManifest, ManifestAgentFrontmatter } from './manifest.js';

// ─── 适配器查询辅助函数 ──────────────────────────────────────

/**
 * 安全地从适配器实例查询布尔值。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 若适配器未注册（如第三方或已移除），回退到 fallback。
 */
export function getAdapterBoolean(
  adapterId: string,
  fn: (a: AdapterInternal) => boolean,
  fallback = false,
  adapter?: AdapterInternal,
): boolean {
  try {
    return fn(adapter ?? getAdapterInternal(adapterId));
  } catch {
    return fallback;
  }
}

/**
 * 安全地从适配器实例查询可空值（如 appendMarker）。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 若适配器未注册，回退到 fallback（null）。
 */
export function getAdapterNullable<T>(
  adapterId: string,
  fn: (a: AdapterInternal) => T | null,
  fallback: T | null = null,
  adapter?: AdapterInternal,
): T | null {
  try {
    return fn(adapter ?? getAdapterInternal(adapterId));
  } catch {
    return fallback;
  }
}

/**
 * 获取适配器家目录 —— 通过 adapter 实例的 resolveHome()，支持环境变量覆盖。
 * 优先使用传入的 adapter 实例，否则通过 registry 查找。
 * 替代旧的硬编码 adapterHomes 映射。
 */
export function getAdapterHome(
  adapterId: string,
  homeDir: string,
  adapter?: AdapterInternal,
): string {
  try {
    const inst = adapter ?? getAdapterInternal(adapterId);
    return inst.resolveHome(homeDir);
  } catch {
    // 适配器未注册 —— 回退
  }
  // 回退：未知适配器使用 .${adapterId}
  return path.join(homeDir, `.${adapterId}`);
}

/** 适配器启发式卸载的目录配置 */
export interface AdapterHeuristicDirConfig {
  /** 目录名（相对于 adapterHome） */
  name: string;
  /** 文件扩展名过滤（如 '.sh'、'.md'、'.rules'），空字符串表示不过滤 */
  extension: string;
}

/** 适配器启发式卸载的完整配置 */
export interface AdapterHeuristicConfig {
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
export function getAdapterHeuristicConfig(
  adapterId: string,
  adapterHome: string,
  adapter?: AdapterInternal,
): AdapterHeuristicConfig {
  try {
    const inst = adapter ?? getAdapterInternal(adapterId);
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

// ─── 虚拟 manifest 构建 ──────────────────────────────────────

/**
 * 构建虚拟 manifest —— 用于启发式卸载中的反向合并 settings。
 * 从 settings.json 中提取 EvoKit 添加的条目。
 */
export function buildVirtualManifest(
  adapterId: string,
  homeDir: string,
  adapterHome: string,
  heuristicConfig: HeuristicConfig,
): AdapterManifest {
  // 尝试从 settings.json 中提取 hooks/env 信息
  const hooks: AdapterManifest['hooks'] = [];
  const envVars: AdapterManifest['envVars'] = [];
  let autoMemoryEnabledSet = false;
  const permissionsAllow: string[] = [];

  for (const cfgFile of heuristicConfig.configFiles) {
    const cfgPath = path.join(adapterHome, cfgFile);
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    } catch {
      continue;
    }

    // 提取引用适配器 hooks 目录的钩子
    const hooksMarker = adapterHome.replace(/\\/g, '/') + '/hooks/';
    if (settings.hooks && typeof settings.hooks === 'object') {
      const hooksObj = settings.hooks as Record<string, unknown>;
      for (const [eventName, eventArr] of Object.entries(hooksObj)) {
        if (!Array.isArray(eventArr)) continue;
        for (const group of eventArr) {
          const str = JSON.stringify(group).replace(/\\\\/g, '/');
          if (str.includes(hooksMarker)) {
            hooks.push({ event: eventName, entry: group as Record<string, unknown> });
          }
        }
      }
    }

    // 提取 autoMemoryEnabled
    if (settings.autoMemoryEnabled === true) {
      autoMemoryEnabledSet = true;
    }

    // 提取已知 EvoKit 环境变量
    const knownEnvVars = ['CLAUDE_CODE_DISABLE_AUTO_MEMORY'];
    if (settings.env && typeof settings.env === 'object') {
      const env = settings.env as Record<string, string>;
      for (const key of knownEnvVars) {
        if (key in env) {
          envVars.push({ key, value: env[key] });
        }
      }
    }
  }

  return {
    adapterId,
    adapterVersion: '0.0.0',
    installedAt: '',
    homeDir,
    adapterHome,
    files: [],
    directories: [],
    hooks,
    envVars,
    autoMemoryEnabledSet,
    permissionsAllow,
    agentFrontmatter: [],
    memorySeeds: [],
    skillDirs: [],
  };
}

/**
 * 构建启发式代理 frontmatter 记录。
 * 扫描 agents 目录中的 .md 文件，使用默认字段。
 */
export function buildHeuristicAgentRecords(agentsDir: string): ManifestAgentFrontmatter[] {
  if (!fse.existsSync(agentsDir)) return [];

  const records: ManifestAgentFrontmatter[] = [];
  try {
    const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    for (const file of agentFiles) {
      records.push({
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

  return records;
}
