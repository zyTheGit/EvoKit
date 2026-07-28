/**
 * 命令层共享编排逻辑测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveHomeDir,
  resolveAdapter,
  getNextStepsLines,
  printVerificationSummary,
} from '../../src/commands/shared.js';
import type { AdapterVerifyCheck } from '../../src/adapters/types.js';

// ─── resolveHomeDir ─────────────────────────────────────────

describe('resolveHomeDir', () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  afterEach(() => {
    // 恢复环境变量
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    } else {
      delete process.env.USERPROFILE;
    }
  });

  it('优先使用 --home 选项', () => {
    process.env.HOME = '/env/home';
    const result = resolveHomeDir({ home: '/opt/home' });
    expect(result).toBe('/opt/home');
  });

  it('其次使用位置参数 directory', () => {
    process.env.HOME = '/env/home';
    const result = resolveHomeDir({ directory: '/dir/home' });
    expect(result).toBe('/dir/home');
  });

  it('--home 优先于 directory', () => {
    const result = resolveHomeDir({ home: '/opt/home', directory: '/dir/home' });
    expect(result).toBe('/opt/home');
  });

  it('回退到 $HOME 环境变量', () => {
    process.env.HOME = '/env/home';
    delete process.env.USERPROFILE;
    const result = resolveHomeDir();
    expect(result).toBe('/env/home');
  });

  it('回退到 $USERPROFILE 环境变量', () => {
    delete process.env.HOME;
    process.env.USERPROFILE = '/user/profile';
    const result = resolveHomeDir();
    expect(result).toBe('/user/profile');
  });

  it('无法确定主目录时抛出错误', () => {
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    expect(() => resolveHomeDir()).toThrow('无法确定主目录');
  });
});

// ─── resolveAdapter ─────────────────────────────────────────

describe('resolveAdapter', () => {
  // 注意：resolveAdapter 依赖适配器注册表，需要先注册适配器
  // 在测试环境中，导入 adapters/index.js 会触发注册

  it('对已知适配器返回 ok=true', async () => {
    // 动态导入以触发适配器注册
    await import('../../src/adapters/index.js');
    const result = resolveAdapter('claude');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.installer.id).toBe('claude');
      expect(result.installer.label).toBe('Claude Code');
    }
  });

  it('对未知适配器返回 ok=false 并包含可用适配器列表', async () => {
    await import('../../src/adapters/index.js');
    const result = resolveAdapter('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('未知适配器');
      expect(result.error.message).toContain('nonexistent');
      expect(result.error.availableAdapters).toContain('claude');
    }
  });
});

// ─── getNextStepsLines ──────────────────────────────────────

describe('getNextStepsLines', () => {
  it('为 Claude 生成正确的后续步骤', () => {
    const lines = getNextStepsLines(['claude']);
    expect(lines.some((l) => l.includes('Claude Code'))).toBe(true);
    expect(lines.some((l) => l.includes('/boot'))).toBe(true);
  });

  it('为 Codex 生成正确的后续步骤', () => {
    const lines = getNextStepsLines(['codex']);
    expect(lines.some((l) => l.includes('Codex CLI'))).toBe(true);
    expect(lines.some((l) => l.includes('doctor --adapter codex'))).toBe(true);
  });

  it('为 OpenCode 生成正确的后续步骤', () => {
    const lines = getNextStepsLines(['opencode']);
    expect(lines.some((l) => l.includes('OpenCode CLI'))).toBe(true);
    expect(lines.some((l) => l.includes('evokit-boot'))).toBe(true);
  });

  it('为未知适配器生成通用步骤', () => {
    const lines = getNextStepsLines(['unknown-adapter']);
    expect(lines.some((l) => l.includes('unknown-adapter'))).toBe(true);
    expect(lines.some((l) => l.includes('已就绪'))).toBe(true);
  });

  it('始终包含通用提示（doctor、全局安装、文档）', () => {
    const lines = getNextStepsLines(['claude']);
    expect(lines.some((l) => l.includes('npx evokit doctor'))).toBe(true);
    expect(lines.some((l) => l.includes('npm install -g'))).toBe(true);
    expect(lines.some((l) => l.includes('github.com'))).toBe(true);
  });

  it('为多个适配器生成步骤', () => {
    const lines = getNextStepsLines(['claude', 'codex']);
    expect(lines.some((l) => l.includes('Claude Code'))).toBe(true);
    expect(lines.some((l) => l.includes('Codex CLI'))).toBe(true);
  });
});

// ─── printVerificationSummary ────────────────────────────────

describe('printVerificationSummary', () => {
  // mock @clack/prompts 的 log 方法
  const mockSuccess = vi.fn();
  const mockWarning = vi.fn();
  const mockError = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    // 在 import shared 之前 mock @clack/prompts
    vi.doMock('@clack/prompts', () => ({
      log: { success: mockSuccess, warning: mockWarning, error: mockError },
      note: vi.fn(),
      outro: vi.fn(),
      spinner: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 动态导入 shared 模块（使用 mock 版本的 @clack/prompts） */
  async function getSummaryFn() {
    const mod = await import('../../src/commands/shared.js');
    return mod.printVerificationSummary;
  }

  it('全部通过时显示验证通过', async () => {
    const summary = await getSummaryFn();
    const checks: AdapterVerifyCheck[] = [
      { name: '检查A', pass: true, detail: '正常' },
      { name: '检查B', pass: true },
    ];
    summary({ label: 'Claude Code' }, checks);
    expect(mockSuccess).toHaveBeenCalledWith('Claude Code 验证通过');
    expect(mockWarning).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  it('有失败项时显示失败数和每项详情', async () => {
    const summary = await getSummaryFn();
    const checks: AdapterVerifyCheck[] = [
      { name: '检查A', pass: true },
      { name: '检查B', pass: false, detail: '文件缺失' },
      { name: '检查C', pass: false },
    ];
    summary({ label: 'Claude Code' }, checks);
    expect(mockWarning).toHaveBeenCalledWith('Claude Code：2 项验证检查未通过');
    // 两个失败项各调用一次 error
    expect(mockError).toHaveBeenCalledTimes(2);
  });

  it('空检查列表视为全部通过', async () => {
    const summary = await getSummaryFn();
    summary({ label: 'Test' }, []);
    expect(mockSuccess).toHaveBeenCalledWith('Test 验证通过');
    expect(mockWarning).not.toHaveBeenCalled();
  });
});
