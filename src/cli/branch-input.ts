/**
 * EvoKit — 分支名称输入
 *
 * 使用 @clack/prompts text() 进行 Git 分支输入。
 *
 * @packageDocumentation
 */

import { text, isCancel, cancel } from '@clack/prompts';

/**
 * 提示用户输入 Git 分支名称。
 *
 * @param message - 提示消息（默认: "Git 分支"）
 * @param defaultValue - 默认分支名称（默认: "main"）
 * @returns 分支名称字符串
 */
export async function inputBranch(
  message: string = 'Git 分支',
  defaultValue: string = 'main',
): Promise<string> {
  const result = await text({
    message,
    placeholder: defaultValue,
    defaultValue,
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return '分支名称不能为空';
      }
      if (/[^a-zA-Z0-9._\-/]/.test(value)) {
        return '分支名称包含无效字符';
      }
    },
  });

  if (isCancel(result)) {
    cancel('安装已取消');
    process.exit(0);
  }

  return (result as string).trim();
}
