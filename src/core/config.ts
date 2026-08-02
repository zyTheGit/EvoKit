import Conf from 'conf';
import { EvoConfig } from './types.js';

const defaults: EvoConfig = {
  homeDir: process.env.HOME || process.env.USERPROFILE || '',
  maxLines: 500,
  maxDays: 30,
  maxLinesArchive: 1000,
  promoteThreshold: 2,
  graduateSessions: 10,
  learnedRulesMax: 50,
  claudeMdMax: 150,
  dryRun: false,
};

let store: Conf<EvoConfig> | null = null;

function getStore(): Conf<EvoConfig> {
  if (!store) {
    store = new Conf<EvoConfig>({
      projectName: 'evokit',
      projectSuffix: '',
      defaults,
    });
  }
  return store;
}

export function getConfig(): EvoConfig {
  return { ...defaults, ...getStore().store };
}

export function setConfigKey<K extends keyof EvoConfig>(key: K, value: EvoConfig[K]): void {
  getStore().set(key, value as any);
}

export function resetConfig(): void {
  getStore().clear();
}

/** 从部分 CLI 选项构建 EvoConfig，与存储的默认值合并 */
export function buildConfig(overrides: Partial<EvoConfig> & { homeDir?: string }): EvoConfig {
  const stored = getConfig();
  return {
    ...stored,
    ...overrides,
    homeDir: overrides.homeDir || stored.homeDir,
  };
}
