/**
 * EvoKit — 进度与显示辅助工具
 *
 * 使用 @clack/prompts 的 spinner()、note()、intro()、outro()、log
 * 在安装过程中输出结构化终端信息。
 *
 * @packageDocumentation
 */

import { spinner as clackSpinner, note, intro, outro, log } from '@clack/prompts';
import type { SpinnerResult } from '@clack/prompts';

/**
 * 创建一个用于跟踪异步操作的 spinner。
 * 进程退出时自动停止。
 */
export function createSpinner(): SpinnerResult {
  const s = clackSpinner();
  return s;
}

/**
 * 使用 spinner 包装异步操作。
 *
 * @param message - 执行期间显示的 spinner 标签
 * @param fn - 在 spinner 下执行的异步函数
 * @returns fn 的返回值
 */
export async function withSpinner<T>(
  message: string,
  fn: (spin: SpinnerResult) => Promise<T>,
): Promise<T> {
  const s = createSpinner();
  s.start(message);
  try {
    const result = await fn(s);
    s.stop(`${message} — 完成`);
    return result;
  } catch (err: unknown) {
    s.stop(`${message} — 失败`);
    throw err;
  }
}

/**
 * 通过 intro() 显示章节标题。
 */
export function sectionIntro(title: string): void {
  intro(title);
}

/**
 * 通过 outro() 显示章节结尾。
 */
export function sectionOutro(message: string): void {
  outro(message);
}

/**
 * 通过 note() 显示信息块。
 */
export function infoBlock(message: string, title?: string): void {
  note(message, title);
}

/**
 * 输出信息消息。
 */
export function logInfo(message: string): void {
  log.info(message);
}

/**
 * 输出成功消息。
 */
export function logSuccess(message: string): void {
  log.success(message);
}

/**
 * 输出警告消息。
 */
export function logWarning(message: string): void {
  log.warning(message);
}

/**
 * 输出错误消息。
 */
export function logError(message: string): void {
  log.error(message);
}

/**
 * 显示步骤消息（来自 log.step）。
 */
export function logStep(message: string): void {
  log.step(message);
}

export type { SpinnerResult };
