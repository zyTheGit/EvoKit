/**
 * EvoKit — 适配器多选器
 *
 * 使用 @clack/prompts multiselect() 进行交互式适配器选择。
 * 支持 ↑↓ 导航、空格切换、回车确认、ESC 取消。
 *
 * @packageDocumentation
 */

import { multiselect, isCancel, cancel, intro, outro } from '@clack/prompts';

export interface AdapterChoice {
  id: string;
  label: string;
  description: string;
}

/** AdapterChoice 的向后兼容别名 */
export interface MenuAdapter {
  key: string;
  label: string;
  description: string;
}

/**
 * 将 MenuAdapter 转换为 AdapterChoice。
 */
export function toChoice(a: MenuAdapter): AdapterChoice {
  return { id: a.key, label: a.label, description: a.description };
}

/**
 * 提示用户选择一个或多个 AI 编程助手。
 *
 * @param adapters - 可选的适配器列表
 * @param initial - 默认预选的适配器 ID（默认: ['claude']）
 * @returns 已选中的适配器 ID 数组（不会为空 — 回退到 initial / ['claude']）
 */
export async function selectAdapters(
  adapters: AdapterChoice[],
  initial: string[] = ['claude'],
): Promise<string[]> {
  if (adapters.length === 0) return initial;

  const options = adapters.map((a) => ({
    value: a.id,
    label: a.label,
    hint: a.description,
  }));

  intro('选择要配置的 AI 助手');

  const result = await multiselect({
    message: 'AI 助手',
    options,
    required: true,
    initialValues: initial.filter((id) => adapters.some((a) => a.id === id)),
  });

  if (isCancel(result)) {
    cancel('安装已取消');
    process.exit(0);
  }

  outro('适配器已选择');

  // result 为 string[]（multiselect 返回 Value[] | symbol，symbol 已在上方处理）
  return result as string[];
}
