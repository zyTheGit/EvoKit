/**
 * EvoKit — Progress & Display Helpers
 *
 * Uses @clack/prompts spinner(), note(), intro(), outro(), log
 * for structured terminal output during installation.
 *
 * @packageDocumentation
 */

import { spinner as clackSpinner, note, intro, outro, log } from '@clack/prompts';
import type { SpinnerResult } from '@clack/prompts';

/**
 * Create a spinner for tracking async operations.
 * Automatically stops on process exit.
 */
export function createSpinner(): SpinnerResult {
  const s = clackSpinner();
  return s;
}

/**
 * Wrap an async operation with a spinner.
 *
 * @param message - Spinner label shown during execution
 * @param fn - Async function to execute under the spinner
 * @returns The return value of fn
 */
export async function withSpinner<T>(
  message: string,
  fn: (spin: SpinnerResult) => Promise<T>,
): Promise<T> {
  const s = createSpinner();
  s.start(message);
  try {
    const result = await fn(s);
    s.stop(`${message} — complete`);
    return result;
  } catch (err: unknown) {
    s.stop(`${message} — failed`);
    throw err;
  }
}

/**
 * Display a section header via intro().
 */
export function sectionIntro(title: string): void {
  intro(title);
}

/**
 * Display a section footer via outro().
 */
export function sectionOutro(message: string): void {
  outro(message);
}

/**
 * Display an info block via note().
 */
export function infoBlock(message: string, title?: string): void {
  note(message, title);
}

/**
 * Log an info message.
 */
export function logInfo(message: string): void {
  log.info(message);
}

/**
 * Log a success message.
 */
export function logSuccess(message: string): void {
  log.success(message);
}

/**
 * Log a warning message.
 */
export function logWarning(message: string): void {
  log.warning(message);
}

/**
 * Log an error message.
 */
export function logError(message: string): void {
  log.error(message);
}

/**
 * Display a step message (from log.step).
 */
export function logStep(message: string): void {
  log.step(message);
}

export type { SpinnerResult };
