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
