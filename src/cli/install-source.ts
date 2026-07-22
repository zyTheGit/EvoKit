/**
 * EvoKit — 安装来源选择器
 *
 * 使用 @clack/prompts select() 选择模板安装方式：
 * GitHub release、npm 或本地路径。
 *
 * @packageDocumentation
 */

import { select, isCancel, cancel } from '@clack/prompts';

export type InstallSource = 'github' | 'npm' | 'local';

export interface SourceOption {
  value: InstallSource;
  label: string;
  hint?: string;
}

const SOURCES: SourceOption[] = [
  { value: 'github', label: 'GitHub Release', hint: '从 GitHub 获取最新稳定版' },
  { value: 'npm', label: 'npm Registry', hint: '已发布的 npm 包' },
  { value: 'local', label: '本地模板', hint: '本地目录路径' },
];

/**
 * 提示用户选择安装来源。
 *
 * @param options - 可选的自定义来源列表（默认: GitHub / npm / 本地）
 * @returns 选中的 InstallSource
 */
export async function selectInstallSource(
  options: SourceOption[] = SOURCES,
): Promise<InstallSource> {
  const result = await select({
    message: '安装来源',
    options,
    initialValue: 'github' as InstallSource,
  });

  if (isCancel(result)) {
    cancel('安装已取消');
    process.exit(0);
  }

  return result as InstallSource;
}
