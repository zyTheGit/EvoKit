/**
 * EvoKit — CLI 入口
 *
 * 从单一模块重新导出所有基于 Clack 的交互组件。
 * 当需要使用多个组件时，请从此处导入，而非单独的文件。
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
