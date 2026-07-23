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
  directoriesRemoved: number;
  backupPath?: string;
  /** 是否为启发式（无清单）卸载 */
  heuristic: boolean;
  warnings: string[];
}

/**
 * 每个适配器安装器必须实现此接口。
 * 要添加新的 AI 助手（Cursor、Pi CLI、Windsurf 等），
 * 实现此类并调用 registerAdapter()。
 */
export interface AdapterInstaller {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly version: string;
  /** 该适配器支持的 AI 助手 CLI 版本范围（如 '>=0.81.0'）*/
  readonly supportedAgentVersion: string;
  /** 标记为实验性 — 尚未完全实现 */
  readonly experimental?: boolean;

  /** 安装此适配器的模板文件 */
  install(config: AdapterInstallConfig): AdapterInstallResult;

  /** 验证现有安装 */
  verify(config: AdapterInstallConfig): AdapterVerifyCheck[];

  /** 返回类型化状态信息（用于 doctor / 状态检查） */
  status(config: AdapterInstallConfig): AdapterStatus;

  /** 卸载此适配器的模板文件。可选 — 默认使用清单驱动的卸载方式。 */
  uninstall?(config: AdapterUninstallConfig): AdapterUninstallResult;
}
