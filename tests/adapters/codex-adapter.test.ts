import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  resolveCodexHome,
  verifyCodexInstallation,
  installCodex,
  injectCodexMemory,
  exportCodexMemory,
  recordCodexSession,
  getCodexStatus,
} from '../../src/adapters/codex/adapter.js';
import {
  CodexHooksBuilder,
  hooksToToml,
  mergeHooksConfigs,
} from '../../src/adapters/codex/hooks.js';
import { CodexHooksJson } from '../../src/adapters/codex/types.js';
import { SessionEntry } from '../../src/core/types.js';

beforeEach(() => {
  delete process.env.CODEX_HOME;
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
        'Codex template not found',
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
