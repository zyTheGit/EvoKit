/**
 * EvoKit — Aider Adapter (Not Yet Implemented)
 *
 * This adapter is a placeholder that clearly signals Aider support
 * is not yet available.  Calling `install()` throws an explicit error
 * so users are not misled into thinking Aider is supported.
 *
 * @packageDocumentation
 */

import type {
  AdapterInstaller,
  AdapterInstallConfig,
  AdapterInstallResult,
  AdapterVerifyCheck,
  AdapterStatus,
} from '../types.js';

export const AIDER_ADAPTER_VERSION = '0.0.1';

export class AiderAdapter implements AdapterInstaller {
  readonly id = 'aider';
  readonly label = 'Aider';
  readonly description = 'Not yet implemented';
  readonly version = AIDER_ADAPTER_VERSION;
  readonly experimental = true as const;

  install(_config: AdapterInstallConfig): AdapterInstallResult {
    throw new Error(
      'Aider adapter is not yet implemented. ' +
        'Watch https://github.com/zyTheGit/EvoKit/issues for updates.',
    );
  }

  verify(_config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return [
      {
        name: 'Aider adapter',
        pass: false,
        detail: 'Not yet implemented',
      },
    ];
  }

  status(_config: AdapterInstallConfig): AdapterStatus {
    return {
      installed: false,
      adapterHome: '',
      allPass: false,
      checks: [
        {
          name: 'Aider adapter',
          pass: false,
          detail: 'Not yet implemented',
        },
      ],
    };
  }
}
