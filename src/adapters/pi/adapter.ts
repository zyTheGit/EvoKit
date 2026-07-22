/**
 * EvoKit — Pi CLI 适配器（尚未实现）
 *
 * 该适配器当前为占位符，明确标明 Pi CLI 支持尚不可用。
 * 调用 `install()` 会抛出明确错误，避免误导用户认为 Pi CLI 可用。
 *
 * Pi CLI 路径结构：
 * - ~/.pi/agent/ — 全局配置（AGENTS.md, settings.json, skills/, extensions/）
 * - .pi/ — 项目级配置（settings.json, skills/, extensions/）
 * - PI_CODING_AGENT_DIR 环境变量可覆盖全局配置目录
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
      'Pi CLI 适配器尚未实现。' + '关注 https://github.com/zyTheGit/EvoKit/issues 获取更新。',
    );
  }

  verify(_config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return [
      {
        name: 'Pi CLI 适配器',
        pass: false,
        detail: '尚未实现',
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
