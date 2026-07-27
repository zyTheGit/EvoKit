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

// ─── 声明式布局配置 ──────────────────────────────────────────

/**
 * 配置文件声明 —— 描述单个配置文件的安装方式。
 *
 * - `type: 'copy'` — 直接复制（对应 CopySection）
 * - `type: 'merge-settings'` — 深度合并 JSON（对应 MergeSettingsSection）
 */
export interface LayoutConfigFile {
  /** 模板中的文件名（相对于 adapterTemplateDir） */
  templateName: string;
  /** 目标文件名（全局时相对于 adapterHome；项目级时相对于 projectAdapterDir 或 projectDir） */
  targetName: string;
  /** 安装方式 */
  type: 'copy' | 'merge-settings';
  /** 复制策略（仅 type: 'copy' 时有效） */
  strategy?: 'always' | 'skip-if-exists';
  /** 是否替换 __HOME__ 占位符 */
  replaceHome?: boolean;
  /** 是否合并 permissions.allow 工作流规则（仅 type: 'merge-settings' 时有效） */
  allowWorkflow?: boolean;
  /** 追加标记（仅 type: 'copy' + strategy: 'skip-if-exists' 时有效） */
  appendMarker?: string;
  /**
   * 项目级时，目标文件是否放在 projectDir 根目录（而非 projectAdapterDir 内）。
   * 例如 Pi 的 settings.json 和 OpenCode 的 opencode.json 放在项目根目录。
   * 默认 false（放在 projectAdapterDir 内）。
   */
  dstInProjectRoot?: boolean;
}

/**
 * copy-dir 声明 —— 描述目录级文件复制。
 */
export interface LayoutConfigCopyDir {
  /** 模板中的目录名（相对于 adapterTemplateDir） */
  templateName: string;
  /** 目标目录名（相对于 adapterHome；项目级时相对于 projectAdapterDir） */
  targetName: string;
  /** 文件扩展名过滤（如 '.md'、'.sh'） */
  filter?: string;
  /** 复制策略 */
  strategy: 'always' | 'skip-if-exists';
  /** 是否替换 __HOME__ 占位符 */
  replaceHome?: boolean;
  /** 计数器类型 */
  counter?: 'filesCreated' | 'hooksInstalled' | 'rulesInstalled' | 'commandsInstalled';
}

/**
 * 权限声明 —— 描述目录内容的文件系统权限设置。
 */
export interface LayoutConfigPermission {
  /** 目录名（相对于 adapterHome；或绝对路径） */
  dir: string;
  /** 文件扩展名过滤 */
  extension: string;
  /** 八进制权限模式 */
  mode: number;
  /** 是否为绝对路径（默认 false，相对于 adapterHome） */
  absolute?: boolean;
}

/**
 * 项目级配置声明 —— 描述项目级安装的文件和目录。
 *
 * 与全局配置结构类似，但：
 * - 认知核心文件始终放在 projectDir 根目录
 * - 配置文件可放在 projectDir 根目录或 projectAdapterDir 内
 * - copy-dir / merge-agents / copy-skills / seed-memory 放在 projectAdapterDir 内
 */
export interface LayoutConfigProject {
  /** 项目级配置文件（放在 projectDir 根目录或 projectAdapterDir 内） */
  configFiles: LayoutConfigFile[];
  /** 项目级 copy-dir 列表 */
  copyDirs: LayoutConfigCopyDir[];
  /** 是否包含 merge-agents section */
  mergeAgents?: { templateName: string; targetName: string };
  /** 是否包含 copy-skills section */
  copySkills?: { templateName: string; targetName: string };
  /** 是否包含 seed-memory section */
  seedMemory?: { templateName: string; files: string[] };
  /** 项目级权限设置 */
  permissions?: LayoutConfigPermission[];
}

/**
 * 声明式布局配置 —— 适配器只需声明此配置，
 * 即可由 BaseAdapter.buildStandardLayout() 自动构建完整的 AdapterLayout。
 *
 * 各适配器的 getLayout() 差异仅在于：
 * - 目录列表不同
 * - 配置文件名和安装方式不同
 * - copy-dir 列表不同
 * - 是否包含 merge-agents / copy-skills / seed-memory
 * - 项目级结构不同
 * - 权限设置不同
 *
 * @public
 */
export interface LayoutConfig {
  // ── 全局安装 ──

  /** 全局子目录列表（相对于 adapterHome） */
  globalDirs: string[];

  /**
   * 认知核心文件配置。
   * - templateName: 模板中的文件名
   * - dstInHome: true 表示目标在 homeDir 根目录（Claude 的 CLAUDE.md），
   *   false 表示目标在 adapterHome 内（其余适配器的 AGENTS.md）
   */
  cognitiveCore: {
    templateName: string;
    dstInHome: boolean;
    strategy: 'always' | 'skip-if-exists';
    replaceHome?: boolean;
    appendMarker?: string;
  };

  /**
   * 额外的全局 copy 文件（如 Claude 的 MEMORY.md）。
   * templateName 和 targetName 均相对于 adapterTemplateDir / adapterHome。
   */
  extraGlobalCopies?: Array<{
    templateName: string;
    targetName: string;
    strategy: 'always' | 'skip-if-exists';
    replaceHome?: boolean;
  }>;

  /** 全局配置文件列表 */
  configFiles: LayoutConfigFile[];

  /** 全局 copy-dir 列表 */
  copyDirs: LayoutConfigCopyDir[];

  /** 全局 merge-agents 配置（省略则不生成此 section） */
  mergeAgents?: { templateName: string; targetName: string };

  /** 全局 copy-skills 配置（省略则不生成此 section） */
  copySkills?: { templateName: string; targetName: string };

  /** 全局 seed-memory 配置（省略则不生成此 section） */
  seedMemory?: { templateName: string; files: string[] };

  /** 全局权限设置 */
  permissions: LayoutConfigPermission[];

  // ── 项目级安装 ──

  /**
   * 项目级配置（省略则不支持项目级安装）。
   * OpenCode 始终有项目级安装（projectDir 默认回退到 cwd）。
   */
  project?: LayoutConfigProject;
}

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
  /** 安装配置文件 — 控制文件覆盖策略。upgrade 时保留用户数据，覆盖框架文件。 */
  profile?: 'full' | 'minimal' | 'upgrade';
}

/** 适配器安装结果摘要 */
export interface AdapterInstallResult {
  filesCreated: number;
  filesSkipped: number;
  hooksInstalled: number;
  commandsInstalled: number;
  rulesInstalled: number;
  agentsInstalled: number;
  skillsInstalled: number;
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
  /**
   * 适配器特有的额外检查项（如 Claude 的 CLAUDE.md 行数限制、记忆文件检查）。
   * doctor 命令会遍历这些检查项并纳入 allPass 计算，无需硬编码适配器特有逻辑。
   */
  extraChecks?: AdapterVerifyCheck[];
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
  /** 适配器家目录（用于显示） */
  adapterHome: string;
  /** 已删除的文件相对路径列表（用于摘要显示） */
  deletedFiles: string[];
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
  /** 适配器描述（用于交互式菜单和状态显示） */
  readonly description: string;

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
 * 注意：uninstall.ts 仍依赖此接口的 resolveHome() 和 getHeuristicConfig()
 * 进行启发式卸载预览，这是已知限制，待后续深化时解决。
 *
 * BaseAdapter 同时实现 {@link AdapterInstaller} 与 {@link AdapterInternal}，
 * 子类继承 BaseAdapter 即自动满足两个接口。
 */
export interface AdapterInternal {
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
