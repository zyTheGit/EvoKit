import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  PiAdapter,
  resolvePiHome,
  installPi,
  verifyPiInstallation,
  injectPiMemory,
  exportPiMemory,
  recordPiSession,
  getPiStatus,
} from '../../src/adapters/pi/adapter.js';

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
    expect(adapter.supportedAgentVersion).toBe('>=0.81.0');
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
  describe('installPi', () => {
    it('creates directory structure and copies files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = installPi({ homeDir, templateDir, dryRun: false });

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
      expect(summary.hooksInstalled).toBe(5); // 5 个扩展文件
    });

    it('respects dry-run mode', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = installPi({ homeDir, templateDir, dryRun: true });

      const piHome = resolvePiHome(homeDir);
      expect(fs.existsSync(path.join(piHome, 'AGENTS.md'))).toBe(false);
      expect(summary.filesCreated).toBeGreaterThan(0);
    });

    it('is idempotent — skips existing files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      installPi({ homeDir, templateDir, dryRun: false });
      const second = installPi({ homeDir, templateDir, dryRun: false });

      expect(second.filesSkipped).toBeGreaterThan(0);
    });

    it('throws with invalid template path', () => {
      expect(() => installPi({ homeDir: tmpDir(), templateDir: '/nonexistent' })).toThrow(
        'Pi 模板未找到',
      );
    });

    it('installs extension files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      installPi({ homeDir, templateDir, dryRun: false });

      const extDir = path.join(resolvePiHome(homeDir), 'extensions');
      expect(fs.existsSync(path.join(extDir, 'evokit-lifecycle.ts'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'evokit-boot.ts'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'evokit-evolve.ts'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'evokit-memory.ts'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'evokit-session.ts'))).toBe(true);
    });

    it('installs agent definitions', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      installPi({ homeDir, templateDir, dryRun: false });

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
      installPi({ homeDir, templateDir, dryRun: false });
      // 创建 memory 目录以确保完整
      fs.mkdirSync(path.join(resolvePiHome(homeDir), 'memory'), { recursive: true });

      const piHome = resolvePiHome(homeDir);
      const checks = verifyPiInstallation(piHome);
      const failing = checks.filter((c) => !c.pass);
      expect(failing).toHaveLength(0);
    });
  });
});

// ─── BaseAdapter 接口测试 ───────────────────────────────────

describe('pi-adapter interface', () => {
  const adapter = new PiAdapter();

  it('install() creates complete installation', () => {
    const homeDir = tmpDir();
    const templateDir = path.resolve('template');

    const result = adapter.install({ homeDir, templateDir });

    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.hooksInstalled).toBe(5);
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

  beforeEach(() => {
    homeDir = tmpDir();
  });

  describe('injectPiMemory', () => {
    it('writes corrections to memory', () => {
      const files = injectPiMemory(homeDir, {
        corrections: [{ pattern: 'test pattern', context: 'test context' }],
      });

      expect(files).toBeGreaterThan(0);

      const memDir = path.join(resolvePiHome(homeDir), 'memory');
      const content = fs.readFileSync(path.join(memDir, 'corrections.jsonl'), 'utf-8');
      expect(content).toContain('test pattern');
      expect(content).toContain('test context');

      // 检查文件权限（600）
      const stats = fs.statSync(path.join(memDir, 'corrections.jsonl'));
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('writes observations to memory', () => {
      injectPiMemory(homeDir, {
        observations: [{ pattern: 'obs pattern', confidence: 0.8, source: 'test' }],
      });

      const memDir = path.join(resolvePiHome(homeDir), 'memory');
      const content = fs.readFileSync(path.join(memDir, 'observations.jsonl'), 'utf-8');
      expect(content).toContain('obs pattern');
      expect(content).toContain('0.8');
    });
  });

  describe('exportPiMemory', () => {
    it('reads injected data back', () => {
      injectPiMemory(homeDir, {
        corrections: [{ pattern: 'test pattern', context: 'test' }],
        observations: [{ pattern: 'obs', confidence: 0.5, source: 'test' }],
      });

      const data = exportPiMemory(homeDir);
      expect(data.corrections).toHaveLength(1);
      expect(data.observations).toHaveLength(1);
      expect(data.corrections[0]).toHaveProperty('pattern', 'test pattern');
    });

    it('returns empty arrays when no memory exists', () => {
      const data = exportPiMemory(homeDir);
      expect(data.corrections).toHaveLength(0);
      expect(data.observations).toHaveLength(0);
      expect(data.learnedRules).toBe('');
    });
  });

  describe('recordPiSession', () => {
    it('records a session tagged as pi', () => {
      recordPiSession(homeDir, {
        duration_seconds: 300,
        corrections: 2,
        observations: 1,
        score: 'A',
      });

      const memDir = path.join(resolvePiHome(homeDir), 'memory');
      const content = fs.readFileSync(path.join(memDir, 'sessions.jsonl'), 'utf-8');
      expect(content).toContain('"assistant":"pi"');
      expect(content).toContain('"duration_seconds":300');
      expect(content).toContain('"score":"A"');
    });
  });

  describe('getPiStatus', () => {
    it('reports not installed when empty', () => {
      const status = getPiStatus(homeDir);
      expect(status.installed).toBe(false);
    });

    it('reports installed after template install', () => {
      const templateDir = path.resolve('template');
      installPi({ homeDir, templateDir, dryRun: false });

      const status = getPiStatus(homeDir);
      expect(status.installed).toBe(true);
      expect(status.agentsPresent).toBe(true);
      expect(status.extensionsPresent).toBe(true);
      expect(status.configPresent).toBe(true);
      expect(status.extensionCount).toBe(5);
    });
  });
});
