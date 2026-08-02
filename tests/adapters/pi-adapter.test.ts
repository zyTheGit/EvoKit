import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { PiAdapter, resolvePiHome, verifyPiInstallation } from '../../src/adapters/pi/adapter.js';

beforeEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
});

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-pi-'));
}

const CONFIG = {
  homeDir: '/tmp/test-home',
  templateDir: '/tmp/test-template',
};

// ─── 元数据测试 ──────────────────────────────────────────────

describe('pi-adapter metadata', () => {
  const adapter = new PiAdapter();

  it('has correct metadata', () => {
    expect(adapter.id).toBe('pi');
    expect(adapter.label).toBe('Pi CLI');
    expect(adapter.version).toBe('0.6.0');
    expect(adapter.supportedAgentVersion).toBe('>=0.82.0');
  });

  it('is no longer experimental', () => {
    expect(adapter.experimental).toBeUndefined();
  });

  it('has correct description', () => {
    expect(adapter.description).toBe('~/.pi/agent/');
  });
});

// ─── 路径解析测试 ────────────────────────────────────────────

describe('pi-adapter path resolution', () => {
  describe('resolvePiHome', () => {
    it('returns ~/.pi/agent by default', () => {
      const home = '/home/test';
      expect(resolvePiHome(home)).toBe(path.join(home, '.pi', 'agent'));
    });

    it('respects PI_CODING_AGENT_DIR env var', () => {
      process.env.PI_CODING_AGENT_DIR = '/custom/pi';
      const home = '/home/test';
      expect(resolvePiHome(home)).toBe('/custom/pi');
      delete process.env.PI_CODING_AGENT_DIR;
    });
  });
});

// ─── 安装测试 ──────────────────────────────────────────────

describe('pi-adapter installer', () => {
  const adapter = new PiAdapter();

  describe('installPi (via adapter.install)', () => {
    it('creates directory structure and copies files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = adapter.install({ homeDir, templateDir, dryRun: false });

      const piHome = resolvePiHome(homeDir);
      expect(fs.existsSync(path.join(piHome, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(piHome, 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(piHome, 'extensions'))).toBe(true);
      expect(fs.existsSync(path.join(piHome, 'agent'))).toBe(true);
      expect(fs.existsSync(path.join(piHome, 'skills'))).toBe(true);
      expect(fs.existsSync(path.join(piHome, 'memory'))).toBe(true);

      // 检查 __HOME__ 替换
      const agents = fs.readFileSync(path.join(piHome, 'AGENTS.md'), 'utf-8');
      expect(agents).not.toContain('__HOME__');
      expect(agents).toContain(homeDir);

      const settings = fs.readFileSync(path.join(piHome, 'settings.json'), 'utf-8');
      expect(settings).not.toContain('__HOME__');
      expect(settings).toContain(homeDir);

      // 摘要计数
      expect(summary.filesCreated).toBeGreaterThan(0);
      expect(summary.hooksInstalled).toBe(3); // 3 个扩展文件（lifecycle/boot/learn）
    });

    it('respects dry-run mode', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = adapter.install({ homeDir, templateDir, dryRun: true });

      const piHome = resolvePiHome(homeDir);
      expect(fs.existsSync(path.join(piHome, 'AGENTS.md'))).toBe(false);
      expect(summary.filesCreated).toBeGreaterThan(0);
    });

    it('is idempotent — skips existing files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      adapter.install({ homeDir, templateDir, dryRun: false });
      const second = adapter.install({ homeDir, templateDir, dryRun: false });

      expect(second.filesSkipped).toBeGreaterThan(0);
    });

    it('throws with invalid template path', () => {
      expect(() => adapter.install({ homeDir: tmpDir(), templateDir: '/nonexistent' })).toThrow(
        'Pi CLI 模板未找到',
      );
    });

    it('installs extension files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      adapter.install({ homeDir, templateDir, dryRun: false });

      const extDir = path.join(resolvePiHome(homeDir), 'extensions');
      expect(fs.existsSync(path.join(extDir, 'evokit-lifecycle.ts'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'evokit-boot.ts'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'evokit-learn.ts'))).toBe(true);
    });

    it('installs agent definitions', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      adapter.install({ homeDir, templateDir, dryRun: false });

      const agentDir = path.join(resolvePiHome(homeDir), 'agent');
      expect(fs.existsSync(path.join(agentDir, 'architect.md'))).toBe(true);
      expect(fs.existsSync(path.join(agentDir, 'reviewer.md'))).toBe(true);
    });
  });

  describe('verifyPiInstallation', () => {
    it('detects incomplete installation', () => {
      const homeDir = tmpDir();
      const piHome = resolvePiHome(homeDir);
      const checks = verifyPiInstallation(piHome);
      const failing = checks.filter((c) => !c.pass);
      expect(failing.length).toBeGreaterThan(2);
    });

    it('passes for complete installation', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      adapter.install({ homeDir, templateDir, dryRun: false });
      // 创建 memory 目录以确保完整
      fs.mkdirSync(path.join(resolvePiHome(homeDir), 'memory'), { recursive: true });

      const piHome = resolvePiHome(homeDir);
      const checks = verifyPiInstallation(piHome);
      const failing = checks.filter((c) => !c.pass);
      expect(failing).toHaveLength(0);
    });
  });
});

// ─── AdapterInstaller 接口测试 ───────────────────────────────

describe('pi-adapter interface', () => {
  const adapter = new PiAdapter();

  it('install() creates complete installation', () => {
    const homeDir = tmpDir();
    const templateDir = path.resolve('template');

    const result = adapter.install({ homeDir, templateDir });

    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.hooksInstalled).toBe(3);
    expect(result.adapterHome).toBe(resolvePiHome(homeDir));
  });

  it('verify() returns checks', () => {
    const homeDir = tmpDir();
    const templateDir = path.resolve('template');
    adapter.install({ homeDir, templateDir });

    const checks = adapter.verify({ homeDir, templateDir });
    expect(checks.length).toBeGreaterThan(0);
    const allPass = checks.every((c) => c.pass);
    expect(allPass).toBe(true);
  });

  it('status() returns AdapterStatus', () => {
    const homeDir = tmpDir();
    const templateDir = path.resolve('template');
    adapter.install({ homeDir, templateDir });

    const status = adapter.status({ homeDir, templateDir });
    expect(status.installed).toBe(true);
    expect(status.allPass).toBe(true);
    expect(status.adapterHome).toBe(resolvePiHome(homeDir));
    expect(status.checks.length).toBeGreaterThan(0);
  });
});

// ─── 记忆测试 ──────────────────────────────────────────────

describe('pi-adapter memory', () => {
  let homeDir: string;
  const adapter = new PiAdapter();

  beforeEach(() => {
    homeDir = tmpDir();
  });

  describe('status', () => {
    it('reports not installed when empty', () => {
      const result = adapter.status({ homeDir, templateDir: '/tmp' });
      expect(result.installed).toBe(false);
    });

    it('reports installed after template install', () => {
      const templateDir = path.resolve('template');
      adapter.install({ homeDir, templateDir, dryRun: false });

      const result = adapter.status({ homeDir, templateDir });
      expect(result.installed).toBe(true);
      expect(result.allPass).toBe(true);
      // 验证关键检查项存在
      const checkNames = result.checks.map((c) => c.name);
      expect(checkNames.some((n) => n.includes('AGENTS.md'))).toBe(true);
      expect(checkNames.some((n) => n.includes('extensions'))).toBe(true);
      expect(checkNames.some((n) => n.includes('settings'))).toBe(true);
    });
  });
});
