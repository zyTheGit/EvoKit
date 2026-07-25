/**
 * 命令层共享编排逻辑测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveHomeDir, resolveAdapter, getNextStepsLines } from '../../src/commands/shared.js';

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
