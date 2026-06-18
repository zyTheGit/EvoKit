/**
 * EvoKit — Installation Source Selector
 *
 * Uses @clack/prompts select() to choose how to install
 * the template: GitHub release, npm, or local path.
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
  { value: 'github', label: 'GitHub Release', hint: 'Latest stable from GitHub' },
  { value: 'npm', label: 'npm Registry', hint: 'Published npm package' },
  { value: 'local', label: 'Local Template', hint: 'Local directory path' },
];

/**
 * Prompt the user to choose an installation source.
 *
 * @param options - Optional custom source list (default: GitHub / npm / Local)
 * @returns The selected InstallSource
 */
export async function selectInstallSource(
  options: SourceOption[] = SOURCES,
): Promise<InstallSource> {
  const result = await select({
    message: 'Installation source',
    options,
    initialValue: 'github' as InstallSource,
  });

  if (isCancel(result)) {
    cancel('Installation cancelled');
    process.exit(0);
  }

  return result as InstallSource;
}
