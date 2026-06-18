/**
 * EvoKit — Branch Name Input
 *
 * Uses @clack/prompts text() for Git branch input.
 *
 * @packageDocumentation
 */

import { text, isCancel, cancel } from '@clack/prompts';

/**
 * Prompt the user for a Git branch name.
 *
 * @param message - The prompt message (default: "Git branch")
 * @param defaultValue - Default branch name (default: "main")
 * @returns The branch name string
 */
export async function inputBranch(
  message: string = 'Git branch',
  defaultValue: string = 'main',
): Promise<string> {
  const result = await text({
    message,
    placeholder: defaultValue,
    defaultValue,
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Branch name cannot be empty';
      }
      if (/[^a-zA-Z0-9._\-\/]/.test(value)) {
        return 'Branch name contains invalid characters';
      }
    },
  });

  if (isCancel(result)) {
    cancel('Installation cancelled');
    process.exit(0);
  }

  return (result as string).trim();
}
