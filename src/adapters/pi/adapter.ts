/**
 * EvoKit — Pi CLI Adapter (Not Yet Implemented)
 *
 * This adapter is a placeholder that clearly signals Pi CLI support
 * is not yet available.  Calling `install()` throws an explicit error
 * so users are not misled into thinking Pi CLI is supported.
 *
 * Pi CLI uses:
 * - ~/.pi/agent/ for global configuration (AGENTS.md, settings.json, skills/, extensions/)
 * - .pi/ for project-level configuration (settings.json, skills/, extensions/)
 * - PI_CODING_AGENT_DIR env var to override the global config directory
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

export const PI_ADAPTER_VERSION = '0.0.1';

export class PiAdapter implements AdapterInstaller {
  readonly id = 'pi';
  readonly label = 'Pi CLI';
  readonly description = 'Not yet implemented';
  readonly version = PI_ADAPTER_VERSION;
  readonly experimental = true as const;

  install(_config: AdapterInstallConfig): AdapterInstallResult {
    throw new Error(
      'Pi CLI adapter is not yet implemented. ' +
        'Watch https://github.com/zyTheGit/EvoKit/issues for updates.',
    );
  }

  verify(_config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return [
      {
        name: 'Pi CLI adapter',
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
          name: 'Pi CLI adapter',
          pass: false,
          detail: 'Not yet implemented',
        },
      ],
    };
  }
}
