import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import {
  resolveCodexHome,
  verifyCodexInstallation,
  installCodex,
  injectCodexMemory,
  exportCodexMemory,
  recordCodexSession,
  getCodexStatus,
  CodexAdapter,
} from '../../src/adapters/codex/adapter.js';
import {
  CodexHooksBuilder,
  hooksToToml,
  mergeHooksConfigs,
} from '../../src/adapters/codex/hooks.js';
import { CodexHooksJson } from '../../src/adapters/codex/types.js';
import { SessionEntry } from '../../src/core/types.js';
import { readManifest, manifestPath } from '../../src/core/manifest.js';

let tmpHome: string;

beforeEach(() => {
  delete process.env.CODEX_HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-codex-'));
});

afterEach(() => {
  fse.removeSync(tmpHome);
});

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-codex-'));
}

// ─── Installer Tests ──────────────────────────────────────────

describe('codex-installer', () => {
  describe('resolveCodexHome', () => {
    it('returns ~/.codex by default', () => {
      const home = '/home/test';
      expect(resolveCodexHome(home)).toBe(path.join(home, '.codex'));
    });

    it('respects CODEX_HOME env var', () => {
      process.env.CODEX_HOME = '/custom/codex';
      const home = '/home/test';
      expect(resolveCodexHome(home)).toBe('/custom/codex');
      delete process.env.CODEX_HOME;
    });
  });

  describe('installCodex', () => {
    it('creates directory structure and copies files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = installCodex({ homeDir, templateDir, dryRun: false });

      const codexHome = resolveCodexHome(homeDir);
      expect(fs.existsSync(path.join(codexHome, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(codexHome, 'hooks.json'))).toBe(true);
      expect(fs.existsSync(path.join(codexHome, 'config.toml'))).toBe(true);
      expect(fs.existsSync(path.join(codexHome, 'rules'))).toBe(true);
      expect(fs.existsSync(path.join(codexHome, 'hooks-scripts'))).toBe(true);
      expect(fs.existsSync(path.join(codexHome, 'memory'))).toBe(true);

      // Check __HOME__ replacement
      const agents = fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf-8');
      expect(agents).not.toContain('__HOME__');
      expect(agents).toContain(homeDir);

      const hooks = fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf-8');
      expect(hooks).not.toContain('__HOME__');
      expect(hooks).toContain(homeDir);

      // Summary counts
      expect(summary.filesCreated).toBeGreaterThan(0);
      expect(summary.hooksInstalled).toBe(3);
      expect(summary.rulesInstalled).toBe(1);
    });

    it('respects dry-run mode', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = installCodex({ homeDir, templateDir, dryRun: true });

      const codexHome = resolveCodexHome(homeDir);
      expect(fs.existsSync(path.join(codexHome, 'AGENTS.md'))).toBe(false);
      expect(summary.filesCreated).toBeGreaterThan(0);
      expect(summary.hooksInstalled).toBe(3);
    });

    it('is idempotent — skips existing files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const first = installCodex({ homeDir, templateDir, dryRun: false });
      const second = installCodex({ homeDir, templateDir, dryRun: false });

      expect(second.filesSkipped).toBeGreaterThan(0);
    });

    it('throws with invalid template path', () => {
      expect(() => installCodex({ homeDir: tmpDir(), templateDir: '/nonexistent' })).toThrow(
        'Codex 模板未找到',
      );
    });
  });

  describe('verifyCodexInstallation', () => {
    it('detects incomplete installation', () => {
      const homeDir = tmpDir();
      const codexHome = resolveCodexHome(homeDir);
      const checks = verifyCodexInstallation(codexHome);
      const failing = checks.filter((c) => !c.pass);
      expect(failing.length).toBeGreaterThan(2);
    });

    it('passes for complete installation', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      installCodex({ homeDir, templateDir, dryRun: false });
      // Create shared memory (for fully complete setup)
      fs.mkdirSync(path.join(homeDir, '.codex', 'memory'), { recursive: true });

      const codexHome = resolveCodexHome(homeDir);
      const checks = verifyCodexInstallation(codexHome);
      const failing = checks.filter((c) => !c.pass);
      expect(failing).toHaveLength(0);
    });
  });
});

// ─── Hooks Tests ──────────────────────────────────────────────

describe('codex-hooks', () => {
  describe('CodexHooksBuilder', () => {
    it('builds a valid hooks.json structure', () => {
      const builder = new CodexHooksBuilder();
      const hooks = builder
        .addSessionStartHook('/path/to/session-start.sh')
        .addStopHook('/path/to/stop.sh')
        .addPreToolUseHook('/path/to/pre-tool-use.sh')
        .build();

      expect(hooks.hooks).toBeDefined();
      expect(hooks.hooks.SessionStart).toHaveLength(1);
      expect(hooks.hooks.Stop).toHaveLength(1);
      expect(hooks.hooks.PreToolUse).toHaveLength(1);
    });

    it('creates valid JSON output', () => {
      const builder = CodexHooksBuilder.createDefault('/scripts');
      const json = builder.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.hooks.SessionStart[0].hooks[0].command).toBe('/scripts/session-start.sh');
      expect(parsed.hooks.SessionStart[0].hooks[0].type).toBe('command');
    });

    it('supports tool guard hooks', () => {
      const builder = new CodexHooksBuilder().addToolGuard('^Bash$', '/path/to/guard.sh').build();

      expect(builder.hooks!.PreToolUse![0].matcher).toBe('^Bash$');
    });

    it('supports permission hooks', () => {
      const hooks = new CodexHooksBuilder()
        .addPermissionHook('^MCP', '/path/to/permissions.sh')
        .build();

      expect(hooks.hooks!.PermissionRequest).toHaveLength(1);
    });

    it('supports PostToolUse hooks', () => {
      const hooks = new CodexHooksBuilder().addPostToolUseHook('/path/to/post-tool-use.sh').build();

      expect(hooks.hooks!.PostToolUse).toHaveLength(1);
      expect(hooks.hooks!.PostToolUse![0].matcher).toBe('.*');
    });

    it('supports PostToolUseFailure hooks', () => {
      const hooks = new CodexHooksBuilder()
        .addPostToolUseFailureHook('/path/to/failure.sh')
        .build();

      expect(hooks.hooks!.PostToolUseFailure).toHaveLength(1);
    });

    it('supports UserPromptSubmit hooks', () => {
      const hooks = new CodexHooksBuilder().addUserPromptSubmitHook('/path/to/prompt.sh').build();

      expect(hooks.hooks!.UserPromptSubmit).toHaveLength(1);
    });

    it('supports SubagentStart hooks', () => {
      const hooks = new CodexHooksBuilder().addSubagentStartHook('/path/to/subagent.sh').build();

      expect(hooks.hooks!.SubagentStart).toHaveLength(1);
    });
  });

  describe('hooksToToml', () => {
    it('generates valid TOML from hooks config', () => {
      const hooksJson: CodexHooksJson = {
        hooks: {
          SessionStart: [
            {
              matcher: 'startup',
              hooks: [{ type: 'command', command: '/script.sh', timeout: 30 }],
            },
          ],
        },
      };
      const toml = hooksToToml(hooksJson);
      expect(toml).toContain('[[hooks.SessionStart]]');
      expect(toml).toContain('command = "/script.sh"');
      expect(toml).toContain('timeout = 30');
    });
  });

  describe('mergeHooksConfigs', () => {
    it('merges multiple configs, later wins for same matcher', () => {
      const a: CodexHooksJson = {
        hooks: {
          SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: '/a.sh' }] }],
        },
      };
      const b: CodexHooksJson = {
        hooks: {
          SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: '/b.sh' }] }],
        },
      };

      const merged = mergeHooksConfigs(a, b);
      expect(merged.hooks!.SessionStart![0].hooks[0].command).toBe('/b.sh');
    });

    it('combines events from different configs', () => {
      const a: CodexHooksJson = {
        hooks: {
          SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: '/a.sh' }] }],
        },
      };
      const b: CodexHooksJson = {
        hooks: { Stop: [{ matcher: '.*', hooks: [{ type: 'command', command: '/b.sh' }] }] },
      };

      const merged = mergeHooksConfigs(a, b);
      expect(merged.hooks!.SessionStart).toHaveLength(1);
      expect(merged.hooks!.Stop).toHaveLength(1);
    });
  });
});

// ─── Memory Tests ─────────────────────────────────────────────

describe('codex-adapter memory', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = tmpDir();
  });

  describe('injectCodexMemory', () => {
    it('writes corrections to shared memory', () => {
      const files = injectCodexMemory(homeDir, {
        corrections: [{ pattern: 'test pattern', context: 'test context' }],
      });

      expect(files).toBeGreaterThan(0);

      const memDir = path.join(homeDir, '.codex', 'memory');
      const content = fs.readFileSync(path.join(memDir, 'corrections.jsonl'), 'utf-8');
      expect(content).toContain('test pattern');
      expect(content).toContain('test context');

      // Check file permissions (600)
      const stats = fs.statSync(path.join(memDir, 'corrections.jsonl'));
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('writes observations to shared memory', () => {
      injectCodexMemory(homeDir, {
        observations: [{ pattern: 'obs pattern', confidence: 0.8, source: 'test' }],
      });

      const memDir = path.join(homeDir, '.codex', 'memory');
      const content = fs.readFileSync(path.join(memDir, 'observations.jsonl'), 'utf-8');
      expect(content).toContain('obs pattern');
      expect(content).toContain('0.8');
    });
  });

  describe('exportCodexMemory', () => {
    it('reads injected data back', () => {
      injectCodexMemory(homeDir, {
        corrections: [{ pattern: 'test pattern', context: 'test' }],
        observations: [{ pattern: 'obs', confidence: 0.5, source: 'test' }],
      });

      const data = exportCodexMemory(homeDir);
      expect(data.corrections).toHaveLength(1);
      expect(data.observations).toHaveLength(1);
      expect(data.corrections[0]).toHaveProperty('pattern', 'test pattern');
    });

    it('returns empty arrays when no memory exists', () => {
      const data = exportCodexMemory(homeDir);
      expect(data.corrections).toHaveLength(0);
      expect(data.observations).toHaveLength(0);
      expect(data.learnedRules).toBe('');
    });
  });

  describe('recordCodexSession', () => {
    it('records a session tagged as codex', () => {
      recordCodexSession(homeDir, {
        duration_seconds: 300,
        corrections: 2,
        observations: 1,
        score: 'A',
      });

      const memDir = path.join(homeDir, '.codex', 'memory');
      const content = fs.readFileSync(path.join(memDir, 'sessions.jsonl'), 'utf-8');
      expect(content).toContain('"assistant":"codex"');
      expect(content).toContain('"duration_seconds":300');
      expect(content).toContain('"score":"A"');
    });
  });

  describe('getCodexStatus', () => {
    it('reports not installed when empty', () => {
      const status = getCodexStatus(homeDir);
      expect(status.installed).toBe(false);
    });

    it('reports installed after template install', () => {
      const templateDir = path.resolve('template');
      installCodex({ homeDir, templateDir, dryRun: false });

      const status = getCodexStatus(homeDir);
      expect(status.installed).toBe(true);
      expect(status.agentsPresent).toBe(true);
      expect(status.hooksPresent).toBe(true);
      expect(status.configPresent).toBe(true);
      expect(status.ruleCount).toBe(1);
    });
  });
});

// ─── CodexAdapter Class Tests ─────────────────────────────────

describe('CodexAdapter class', () => {
  it('has correct static properties', () => {
    const adapter = new CodexAdapter();
    expect(adapter.id).toBe('codex');
    expect(adapter.label).toBe('Codex CLI');
    expect(adapter.description).toBe('~/.codex/ + .codex/');
    expect(adapter.supportedAgentVersion).toBe('>=1.0.0');
  });

  describe('install', () => {
    it('creates manifest after installation', () => {
      const adapter = new CodexAdapter();
      const result = adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 验证清单文件已创建
      const mPath = manifestPath(tmpHome);
      expect(fse.existsSync(mPath)).toBe(true);

      // 验证清单内容
      const manifest = readManifest(tmpHome);
      expect(manifest).not.toBeNull();
      expect(manifest!.adapters).toHaveProperty('codex');
      expect(manifest!.adapters.codex.adapterId).toBe('codex');
      expect(manifest!.adapters.codex.adapterHome).toBe(resolveCodexHome(tmpHome));

      // 验证安装结果
      expect(result.filesCreated).toBeGreaterThan(0);
      expect(result.adapterHome).toBe(resolveCodexHome(tmpHome));
    });

    it('does not create manifest in dry-run mode', () => {
      const adapter = new CodexAdapter();
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: true,
      });

      const mPath = manifestPath(tmpHome);
      expect(fse.existsSync(mPath)).toBe(false);
    });

    it('updates existing manifest when reinstalling', () => {
      const adapter = new CodexAdapter();

      // 第一次安装
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 第二次安装（升级）
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 清单仍应存在且有效
      const manifest = readManifest(tmpHome);
      expect(manifest!.adapters).toHaveProperty('codex');
    });
  });

  describe('verify', () => {
    it('returns failing checks for missing installation', () => {
      const adapter = new CodexAdapter();
      const checks = adapter.verify({ homeDir: tmpHome, templateDir: path.resolve('template') });
      const failing = checks.filter((c) => !c.pass);
      expect(failing.length).toBeGreaterThan(0);
    });

    it('returns passing checks after installation', () => {
      const adapter = new CodexAdapter();
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      const checks = adapter.verify({ homeDir: tmpHome, templateDir: path.resolve('template') });
      const failing = checks.filter((c) => !c.pass);
      expect(failing).toHaveLength(0);
    });
  });

  describe('status', () => {
    it('reports not installed when empty', () => {
      const adapter = new CodexAdapter();
      const status = adapter.status({ homeDir: tmpHome, templateDir: path.resolve('template') });

      expect(status.installed).toBe(false);
      expect(status.allPass).toBe(false);
      expect(status.adapterHome).toBe(resolveCodexHome(tmpHome));
    });

    it('reports installed after installation', () => {
      const adapter = new CodexAdapter();
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      const status = adapter.status({ homeDir: tmpHome, templateDir: path.resolve('template') });
      expect(status.installed).toBe(true);
      expect(status.allPass).toBe(true);
    });
  });

  describe('uninstall', () => {
    it('removes installed files via manifest', () => {
      const adapter = new CodexAdapter();
      const codexHome = resolveCodexHome(tmpHome);

      // 先安装
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 验证安装存在
      expect(fse.existsSync(path.join(codexHome, 'AGENTS.md'))).toBe(true);
      expect(fse.existsSync(path.join(codexHome, 'hooks.json'))).toBe(true);

      // 卸载
      const result = adapter.uninstall({
        homeDir: tmpHome,
        purge: true,
        dryRun: false,
        noBackup: true,
      });

      // 验证卸载结果
      expect(result.filesDeleted).toBeGreaterThan(0);
      expect(result.heuristic).toBe(false);

      // 验证清单已移除
      expect(fse.existsSync(manifestPath(tmpHome))).toBe(false);
    });

    it('preserves user data by default', () => {
      const adapter = new CodexAdapter();
      const codexHome = resolveCodexHome(tmpHome);

      // 安装
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 创建用户数据（不在清单中的运行时文件）
      const correctionsPath = path.join(codexHome, 'memory', 'corrections.jsonl');
      fs.mkdirSync(path.join(codexHome, 'memory'), { recursive: true });
      fs.writeFileSync(correctionsPath, '{"pattern":"test","context":"ctx","count":1}', 'utf-8');
      fs.chmodSync(correctionsPath, 0o600);

      // 卸载（不 purge）
      const result = adapter.uninstall({
        homeDir: tmpHome,
        purge: false,
        dryRun: false,
        noBackup: true,
      });

      // 不在清单中的运行时文件不受卸载影响，仍保留
      expect(fse.existsSync(correctionsPath)).toBe(true);
      // memory 目录因仍有文件而保留
      expect(result.directoriesRemoved).toBeGreaterThanOrEqual(0);
    });

    it('deletes EvoKit seed files even without purge', () => {
      const adapter = new CodexAdapter();
      const codexHome = resolveCodexHome(tmpHome);

      // 安装
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // memory/README.md 是 EvoKit 种子文件
      const readmePath = path.join(codexHome, 'memory', 'README.md');
      expect(fse.existsSync(readmePath)).toBe(true);

      // 卸载（不 purge）
      adapter.uninstall({
        homeDir: tmpHome,
        purge: false,
        dryRun: false,
        noBackup: true,
      });

      // 种子文件应被删除
      expect(fse.existsSync(readmePath)).toBe(false);
    });

    it('makes no changes in dry-run mode', () => {
      const adapter = new CodexAdapter();
      const codexHome = resolveCodexHome(tmpHome);

      // 安装
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 干跑卸载
      adapter.uninstall({
        homeDir: tmpHome,
        purge: true,
        dryRun: true,
        noBackup: true,
      });

      // 文件应仍存在
      expect(fse.existsSync(path.join(codexHome, 'AGENTS.md'))).toBe(true);

      // 清单应仍存在
      expect(fse.existsSync(manifestPath(tmpHome))).toBe(true);
    });

    it('falls back to heuristic without manifest', () => {
      const adapter = new CodexAdapter();

      // 安装
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 删除清单（模拟无清单状态）
      fse.removeSync(manifestPath(tmpHome));

      // 卸载
      const result = adapter.uninstall({
        homeDir: tmpHome,
        purge: true,
        dryRun: false,
        noBackup: true,
      });

      // 应使用启发式卸载
      expect(result.heuristic).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('creates backup by default', () => {
      const adapter = new CodexAdapter();

      // 安装
      adapter.install({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        dryRun: false,
      });

      // 卸载（不跳过备份）
      const result = adapter.uninstall({
        homeDir: tmpHome,
        purge: true,
        dryRun: false,
        noBackup: false,
      });

      expect(result.backupPath).toBeDefined();
    });
  });
});

// ─── Manifest Integration Tests ───────────────────────────────

describe('codex manifest integration', () => {
  it('manifest records all installed files', () => {
    const adapter = new CodexAdapter();

    adapter.install({
      homeDir: tmpHome,
      templateDir: path.resolve('template'),
      dryRun: false,
    });

    const manifest = readManifest(tmpHome);
    const codexRecord = manifest!.adapters.codex;

    // 验证清单记录了关键文件
    expect(codexRecord.files.length).toBeGreaterThan(0);

    const filePaths = codexRecord.files.map((f: { path: string }) => f.path);
    expect(filePaths.some((p: string) => p.includes('AGENTS.md'))).toBe(true);
    expect(filePaths.some((p: string) => p.includes('hooks.json'))).toBe(true);

    // 验证目录记录
    expect(codexRecord.directories.length).toBeGreaterThan(0);
  });

  it('manifest records adapterHome correctly', () => {
    const adapter = new CodexAdapter();
    const codexHome = resolveCodexHome(tmpHome);

    adapter.install({
      homeDir: tmpHome,
      templateDir: path.resolve('template'),
      dryRun: false,
    });

    const manifest = readManifest(tmpHome);
    expect(manifest!.adapters.codex.adapterHome).toBe(codexHome);
  });
});
