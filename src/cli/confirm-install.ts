/**
 * EvoKit — 确认提示
 *
 * 使用 @clack/prompts confirm() 进行是/否确认对话框。
 *
 * @packageDocumentation
 */

import { confirm, isCancel, cancel } from '@clack/prompts';

/**
 * 询问用户确认操作。
 *
 * @param message - 提示消息（默认: "继续安装？"）
 * @param initial - 默认值（默认: true）
 * @returns 确认返回 true，否则返回 false
 */
export async function confirmAction(
  message: string = '继续安装？',
  initial: boolean = true,
): Promise<boolean> {
  const result = await confirm({
    message,
    initialValue: initial,
  });

  if (isCancel(result)) {
    cancel('安装已取消');
    process.exit(0);
  }

  return result as boolean;
}
