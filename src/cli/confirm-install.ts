/**
 * EvoKit — Confirmation Prompt
 *
 * Uses @clack/prompts confirm() for yes/no confirmation dialogs.
 *
 * @packageDocumentation
 */

import { confirm, isCancel, cancel } from '@clack/prompts';

/**
 * Ask the user to confirm an action.
 *
 * @param message - The prompt message (default: "Continue installation?")
 * @param initial - Default value (default: true)
 * @returns true if confirmed, false otherwise
 */
export async function confirmAction(
  message: string = 'Continue installation?',
  initial: boolean = true,
): Promise<boolean> {
  const result = await confirm({
    message,
    initialValue: initial,
  });

  if (isCancel(result)) {
    cancel('Installation cancelled');
    process.exit(0);
  }

  return result as boolean;
}
