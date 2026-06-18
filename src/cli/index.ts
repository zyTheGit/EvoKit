/**
 * EvoKit — CLI Entry
 *
 * Re-exports all Clack-based interactive components from a single module.
 * Import from here instead of the individual files when using multiple components.
 *
 * @packageDocumentation
 */

export { selectAdapters } from './adapter-selector.js';
export type { AdapterChoice } from './adapter-selector.js';

export { selectInstallSource } from './install-source.js';
export type { InstallSource, SourceOption } from './install-source.js';

export { confirmAction } from './confirm-install.js';

export { inputBranch } from './branch-input.js';

export {
  createSpinner,
  withSpinner,
  sectionIntro,
  sectionOutro,
  infoBlock,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logStep,
} from './progress.js';
export type { SpinnerResult } from './progress.js';
