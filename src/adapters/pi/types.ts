/**
 * EvoKit — Pi CLI 适配器类型
 *
 * 仅由 Pi 适配器使用的 Pi 专用类型。
 * 核心/共享类型位于 `src/core/types.ts`。
 *
 * @packageDocumentation
 */

/** Pi CLI 扩展的生命周期事件名称 */
export type PiExtensionEventName =
  | 'session_start'
  | 'session_shutdown'
  | 'tool_call'
  | 'tool_result'
  | 'before_agent_start'
  | 'agent_end'
  | 'agent_settled'
  | 'turn_start'
  | 'turn_end'
  | 'context'
  | 'input'
  | 'project_trust'
  | 'resources_discover';

/** Pi 适配器的选项 */
export interface PiAdapterOptions {
  /** 覆盖 Pi 全局配置目录（默认 ~/.pi/agent/） */
  piHome?: string;
  /** 共享记忆目录（覆盖默认路径） */
  sharedMemoryDir?: string;
  /** 仅预览，不做实际修改 */
  dryRun?: boolean;
  /** 安装后验证 */
  verify?: boolean;
}

/** Pi 专属的安装配置 */
export interface PiInstallConfig {
  homeDir: string;
  templateDir: string;
  /** 项目目录（用于安装项目级文件） */
  projectDir?: string;
  /** 覆盖 Pi 全局配置目录 */
  piHome?: string;
  dryRun?: boolean;
}

/** Pi 扩展的钩子脚本执行结果 */
export interface PiHookResult {
  continue: boolean;
  stopReason?: string;
  additionalContext?: string;
}
