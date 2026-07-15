import Conf from 'conf';
import { EvoConfig } from './types.js';

const defaults: EvoConfig = {
  homeDir: process.env.HOME || process.env.USERPROFILE || '',
  maxLines: 500,
  maxDays: 30,
  maxLinesArchive: 1000,
  confidenceDecayDays: 60,
  confidenceThreshold: 0.3,
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

/** Build an EvoConfig from partial CLI options, merging with stored defaults */
export function buildConfig(overrides: Partial<EvoConfig> & { homeDir?: string }): EvoConfig {
  const stored = getConfig();
  return {
    ...stored,
    ...overrides,
    homeDir: overrides.homeDir || stored.homeDir,
  };
}
