/**
 * EvoKit — OpenCode 适配器类型定义
 *
 * OpenCode 专属的类型定义，仅供 OpenCode 适配器使用。
 * 核心/共享类型保留在 `src/core/types.ts` 中。
 *
 * @packageDocumentation
 */

/** OpenCode 适配器的选项 */
export interface OpenCodeAdapterOptions {
  opencodeDir?: string;
  dryRun?: boolean;
  verify?: boolean;
}

/** OpenCode 专属的安装配置 */
export interface OpenCodeInstallConfig {
  homeDir: string;
  projectDir: string;
  templateDir: string;
  dryRun?: boolean;
}

// ─── opencode.json 配置类型 ─────────────────────────────────

/** OpenCode 代码格式化器配置 */
export interface OpenCodeFormatter {
  /** 禁用此格式化器 */
  disabled?: boolean;
  /** 格式化命令部分，使用 $FILE 占位符 */
  command: string[];
  /** 命令的环境变量 */
  environment?: Record<string, string>;
  /** 适用的文件扩展名（如 [".js", ".ts"]） */
  extensions: string[];
}

/** OpenCode 上下文压缩配置 */
export interface OpenCodeCompaction {
  /** 自动压缩（默认 true） */
  auto?: boolean;
  /** 移除旧工具输出以节省 token（默认 false） */
  prune?: boolean;
  /** 压缩期间保留的 token 缓冲（默认 10000） */
  reserved?: number;
}

/** OpenCode 文件监视配置 */
export interface OpenCodeWatcher {
  /** 排除的 glob 模式列表 */
  ignore?: string[];
}

/** OpenCode MCP 服务器配置 */
export interface OpenCodeMcpServer {
  /** 服务器类型 */
  type?: 'stdio' | 'http';
  /** HTTP URL（type 为 http 时） */
  url?: string;
  /** 是否启用 */
  enabled?: boolean;
}

/** OpenCode 权限动作（简写形式） */
export type PermissionAction = 'allow' | 'deny' | 'ask';

/** OpenCode 权限规则（简写或带模式匹配的对象形式） */
export type PermissionRuleConfig = PermissionAction | Record<string, PermissionAction>;

/** OpenCode 权限配置（简写或按工具类别映射） */
export type PermissionConfig =
  | PermissionAction
  | {
      read?: PermissionRuleConfig;
      edit?: PermissionRuleConfig;
      glob?: PermissionRuleConfig;
      grep?: PermissionRuleConfig;
      list?: PermissionRuleConfig;
      bash?: PermissionRuleConfig;
      task?: PermissionRuleConfig;
      external_directory?: PermissionRuleConfig;
      todowrite?: PermissionAction;
      question?: PermissionAction;
      webfetch?: PermissionAction;
      websearch?: PermissionAction;
      lsp?: PermissionRuleConfig;
      doom_loop?: PermissionAction;
      skill?: PermissionRuleConfig;
      /** 自定义工具 / MCP 工具模式 */
      [key: string]: PermissionRuleConfig | undefined;
    };

/** OpenCode 代理配置 */
export interface OpenCodeAgentConfig {
  /** 代理描述 */
  description?: string;
  /** 模型覆盖 */
  model?: string;
  /** 代理系统提示词 */
  prompt?: string;
  /**
   * 工具权限覆盖（已废弃，使用 permission 字段）
   * @deprecated 使用 permission 字段替代
   */
  tools?: Record<string, boolean>;
  /** 权限控制（推荐，替代 tools 字段） */
  permission?: PermissionConfig;
}

/** OpenCode 自定义命令配置 */
export interface OpenCodeCommandConfig {
  /** 提示词模板（$ARGUMENTS 为参数替换） */
  template: string;
  /** 命令描述 */
  description: string;
  /** 代理覆盖 */
  agent?: string;
  /** 模型覆盖 */
  model?: string;
}

/** OpenCode 完整配置类型（opencode.json） */
export interface OpenCodeConfig {
  $schema?: string;
  /** 主模型 */
  model?: string;
  /** 轻量任务模型 */
  small_model?: string;
  /** 提供商配置 */
  provider?: Record<string, unknown>;
  /** TUI 设置 */
  tui?: Record<string, unknown>;
  /** 服务器设置 */
  server?: Record<string, unknown>;
  /**
   * 工具启用/禁用（已废弃，使用 permission 字段）
   * @deprecated 使用 permission 字段替代
   */
  tools?: Record<string, boolean>;
  /** 主题 */
  theme?: string;
  /** 代理配置 */
  agent?: Record<string, OpenCodeAgentConfig>;
  /** 默认代理 */
  default_agent?: string;
  /** 分享设置 */
  share?: 'manual' | 'auto' | 'disabled';
  /** 自定义命令 */
  command?: Record<string, OpenCodeCommandConfig>;
  /** 快捷键 */
  keybinds?: Record<string, string>;
  /** 自动更新 */
  autoupdate?: boolean | 'notify';
  /** 代码格式化器 */
  formatter?: Record<string, OpenCodeFormatter>;
  /** 权限控制（推荐，替代 tools 字段） */
  permission?: PermissionConfig;
  /** 上下文压缩 */
  compaction?: OpenCodeCompaction;
  /** 文件监视 */
  watcher?: OpenCodeWatcher;
  /** MCP 服务器 */
  mcp?: Record<string, OpenCodeMcpServer>;
  /** 插件列表 */
  plugin?: string[];
  /** 指令文件列表（glob 模式） */
  instructions?: string[];
  /** 禁用的提供商 */
  disabled_providers?: string[];
  /** 启用的提供商 */
  enabled_providers?: string[];
  /** 实验性选项 */
  experimental?: Record<string, unknown>;
}
