/**
 * EvoKit — 适配器安装器接口
 *
 * @public — 公共适配器 API 的一部分。实现此接口即可添加自定义适配器。
 *
 * 每个适配器（Claude Code、Codex CLI、OpenCode CLI 等）都实现此接口，
 * 以提供统一的模板安装和验证功能。
 *
 * @packageDocumentation
 */

import type { HeuristicConfig } from './base-adapter.js';

/**
 * @public — 此类型是公共适配器 API 的一部分。
 * 第三方适配器实现者应使用此类型。
 */
export interface AdapterInstallConfig {
  homeDir: string;
  templateDir: string;
  projectDir?: string;
  adapterHome?: string;
  dryRun?: boolean;
  /** 是否写入 permissions.allow 工作流规则（如 npm test/lint 免确认） */
  allowWorkflow?: boolean;
}

/** 适配器安装结果摘要 */
export interface AdapterInstallResult {
  filesCreated: number;
  filesSkipped: number;
  hooksInstalled: number;
  commandsInstalled: number;
  rulesInstalled: number;
  agentsInstalled: number;
  adapterHome: string;
}

/** 单个验证检查项 */
export interface AdapterVerifyCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

/** `AdapterInstaller.status()` 返回的类型化状态 */
export interface AdapterStatus {
  installed: boolean;
  adapterHome: string;
  allPass: boolean;
  checks: AdapterVerifyCheck[];
  /** 项目目录（用于安装项目级文件的适配器，如 OpenCode） */
  projectDir?: string;
}

/** 适配器卸载操作的配置 */
export interface AdapterUninstallConfig {
  homeDir: string;
  projectDir?: string;
  adapterHome?: string;
  /** 删除用户数据（memory/、MEMORY.md）以及 EvoKit 管理的文件 */
  purge?: boolean;
  /** 仅预览，不做实际修改 */
  dryRun?: boolean;
  /** 跳过备份创建 */
  noBackup?: boolean;
  /** 自定义备份目录 */
  backupDir?: string;
}

/** 适配器卸载结果摘要 */
export interface AdapterUninstallResult {
  filesDeleted: number;
  filesPreserved: number;
  hooksRemoved: number;
  envVarsRemoved: number;
  agentFieldsRemoved: number;
  /** 卸载时移除的 permissions.allow 规则数量 */
  permissionsAllowRemoved: number;
  directoriesRemoved: number;
  backupPath?: string;
  /** 是否为启发式（无清单）卸载 */
  heuristic: boolean;
  warnings: string[];
}

/**
 * 适配器公共接口 —— 命令层和外部调用者只依赖此接口。
 *
 * 包含安装、验证、状态检查、卸载等面向用户的操作，
 * 以及最基本的标识信息（id、label）。
 *
 * 要添加新的 AI 助手（Cursor、Windsurf 等），
 * 实现 {@link AdapterInstaller} 与 {@link AdapterInternal} 两个接口，
 * 或继承 {@link BaseAdapter}（同时实现两者）。
 *
 * @public — 公共适配器 API 的一部分。
 */
export interface AdapterInstaller {
  /** 适配器唯一标识（如 'claude'、'codex'、'opencode'、'pi'） */
  readonly id: string;
  /** 适配器显示名称（如 'Claude Code'、'Codex CLI'） */
  readonly label: string;

  /** 安装此适配器的模板文件 */
  install(config: AdapterInstallConfig): AdapterInstallResult;

  /** 验证现有安装 */
  verify(config: AdapterInstallConfig): AdapterVerifyCheck[];

  /** 返回类型化状态信息（用于 doctor / 状态检查） */
  status(config: AdapterInstallConfig): AdapterStatus;

  /** 卸载此适配器的模板文件。可选 — 默认使用清单驱动的卸载方式。 */
  uninstall?(config: AdapterUninstallConfig): AdapterUninstallResult;
}

/**
 * 适配器框架内部接口 —— 仅框架内部代码（reverse-layout-engine 等）依赖。
 *
 * 包含路径解析、启发式配置、布局构建等框架运行所需的成员。
 * 命令层和外部调用者不应使用此接口。
 *
 * BaseAdapter 同时实现 {@link AdapterInstaller} 与 {@link AdapterInternal}，
 * 子类继承 BaseAdapter 即自动满足两个接口。
 */
export interface AdapterInternal {
  /** 适配器描述（用于交互式选择菜单的提示信息） */
  readonly description: string;
  /** 适配器版本 */
  readonly version: string;
  /** 该适配器支持的 AI 助手 CLI 版本范围（如 '>=0.81.0'）*/
  readonly supportedAgentVersion: string;
  /** 标记为实验性 — 尚未完全实现 */
  readonly experimental?: boolean;

  /** 解析适配器全局安装目录（支持环境变量覆盖） */
  resolveHome(homeDir: string): string;

  /** 启发式卸载配置（清单缺失时的回退） */
  getHeuristicConfig(adapterHome: string): HeuristicConfig;

  /** 是否在卸载时对配置文件执行反向合并（而非直接删除）。 */
  reverseMergesSettings?(): boolean;

  /** 认知核心文件的 appendMarker（用于精确移除追加的区段）。 */
  cognitiveCoreAppendMarker?(): string | null;
}
