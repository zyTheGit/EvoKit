/**
 * EvoKit — Adapter Multi-Selector
 *
 * Uses @clack/prompts multiselect() for interactive adapter selection.
 * Supports ↑↓ navigation, Space to toggle, Enter to confirm, ESC to cancel.
 *
 * @packageDocumentation
 */

import { multiselect, isCancel, cancel, intro, outro } from '@clack/prompts';

export interface AdapterChoice {
  id: string;
  label: string;
  description: string;
}

/** Backward-compatible alias for AdapterChoice */
export interface MenuAdapter {
  key: string;
  label: string;
  description: string;
}

/**
 * Convert a MenuAdapter to an AdapterChoice.
 */
export function toChoice(a: MenuAdapter): AdapterChoice {
  return { id: a.key, label: a.label, description: a.description };
}

/**
 * Prompt the user to select one or more AI coding assistants.
 *
 * @param adapters - Available adapters to choose from
 * @param initial - Adapter IDs pre-selected by default (default: ['claude'])
 * @returns Selected adapter IDs (never empty — falls back to initial / ['claude'])
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

  intro('Select AI assistants to configure');

  const result = await multiselect({
    message: 'AI assistants',
    options,
    required: true,
    initialValues: initial.filter((id) => adapters.some((a) => a.id === id)),
  });

  if (isCancel(result)) {
    cancel('Installation cancelled');
    process.exit(0);
  }

  outro('Adapters selected');

  // result is string[] (multiselect returns Value[] | symbol, we handled symbol above)
  return result as string[];
}
