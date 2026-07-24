import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import { reverseMergeSettings } from '../../src/core/reverse-merge-settings.js';
import type { AdapterManifest } from '../../src/core/manifest.js';

let tmpDir: string;

function makeManifest(overrides: Partial<AdapterManifest> = {}): AdapterManifest {
  return {
    adapterId: 'claude',
    adapterVersion: '0.4.13',
    installedAt: '2026-01-01T00:00:00Z',
    homeDir: '/home/test',
    adapterHome: '/home/test/.claude',
    files: [],
    directories: [],
    hooks: [],
    envVars: [],
    autoMemoryEnabledSet: false,
    agentFrontmatter: [],
    memorySeeds: [],
    skillDirs: [],
    ...overrides,
  };
}

describe('reverse-merge-settings', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-rms-'));
  });

  afterEach(() => {
    fse.removeSync(tmpDir);
  });

  // ─── Hook removal ────────────────────────────────────────────

  describe('hook removal', () => {
    it('removes hook entries by event name + JSON match', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const hookEntry = {
        matcher: 'Bash',
        hooks: [{ command: '/home/test/.claude/hooks/run.sh' }],
      };
      const userHook = { matcher: 'Edit', hooks: [{ command: '/usr/local/bin/user-script.sh' }] };

      const settings = {
        hooks: {
          PreToolUse: [hookEntry, userHook],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        hooks: [{ event: 'PreToolUse', entry: hookEntry }],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.hooksRemoved).toBe(1);
      expect(result.changed).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.hooks.PreToolUse).toHaveLength(1);
      expect(updated.hooks.PreToolUse[0]).toEqual(userHook);
    });

    it('deletes event key when all hook entries removed', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const hookEntry = {
        matcher: 'Bash',
        hooks: [{ command: '/home/test/.claude/hooks/run.sh' }],
      };

      const settings = {
        someUserSetting: true,
        hooks: {
          PreToolUse: [hookEntry],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        hooks: [{ event: 'PreToolUse', entry: hookEntry }],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.hooksRemoved).toBe(1);
      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.hooks).toBeUndefined();
      expect(updated.someUserSetting).toBe(true);
    });

    it('preserves user-added hooks', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const userHook = { matcher: 'Write', hooks: [{ command: 'my-script.sh' }] };

      const settings = {
        hooks: {
          PreToolUse: [userHook],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        hooks: [
          { event: 'PreToolUse', entry: { matcher: 'Bash', hooks: [{ command: 'evokit.sh' }] } },
        ],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.hooksRemoved).toBe(0);
      expect(result.changed).toBe(false);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.hooks.PreToolUse).toHaveLength(1);
    });
  });

  // ─── Env var removal ─────────────────────────────────────────

  describe('env var removal', () => {
    it('removes env vars by key+value match', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        env: {
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
          USER_CUSTOM_VAR: 'myvalue',
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        envVars: [{ key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', value: '1' }],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.envVarsRemoved).toBe(1);
      expect(result.changed).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBeUndefined();
      expect(updated.env.USER_CUSTOM_VAR).toBe('myvalue');
    });

    it('deletes env key when all env vars removed', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        someUserSetting: true,
        env: {
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        envVars: [{ key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', value: '1' }],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.envVarsRemoved).toBe(1);
      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.env).toBeUndefined();
      expect(updated.someUserSetting).toBe(true);
    });

    it('does not remove env var if value differs', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        env: {
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        envVars: [{ key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', value: '1' }],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.envVarsRemoved).toBe(0);
      expect(result.changed).toBe(false);
    });
  });

  // ─── autoMemoryEnabled ───────────────────────────────────────

  describe('autoMemoryEnabled', () => {
    it('reverts autoMemoryEnabled when set by manifest', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        autoMemoryEnabled: true,
        hooks: {},
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({ autoMemoryEnabledSet: true });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.autoMemoryEnabledReverted).toBe(true);
      expect(result.changed).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.autoMemoryEnabled).toBeUndefined();
    });

    it('does not revert autoMemoryEnabled when not set by manifest', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        autoMemoryEnabled: true,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({ autoMemoryEnabledSet: false });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.autoMemoryEnabledReverted).toBe(false);
      expect(result.changed).toBe(false);
    });
  });

  // ─── Permissions removal ─────────────────────────────────────

  describe('permissions removal', () => {
    it('removes permissions allow entries', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        permissions: { allow: ['Bash(bash .claude/hooks/*.sh)', 'Read', 'Write'] },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        permissionsAllow: ['Bash(bash .claude/hooks/*.sh)', 'Read'],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.permissionsAllowRemoved).toBe(2);
      expect(result.changed).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.permissions.allow).toEqual(['Write']);
    });

    it('removes permissions deny entries', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        permissions: { deny: ['Bash(rm -rf /)', 'Edit(/etc/*)'] },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        permissionsDeny: ['Bash(rm -rf /)'],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.permissionsDenyRemoved).toBe(1);
      expect(result.changed).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.permissions.deny).toEqual(['Edit(/etc/*)']);
    });

    it('deletes empty permissions arrays', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        someUserSetting: true,
        permissions: { allow: ['Bash(bash .claude/hooks/*.sh)'] },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        permissionsAllow: ['Bash(bash .claude/hooks/*.sh)'],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.permissionsAllowRemoved).toBe(1);
      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // permissions.allow was the only key — empty permissions object is cleaned up entirely
      expect(updated.permissions).toBeUndefined();
      expect(updated.someUserSetting).toBe(true);
    });

    it('仅移除清单中记录的规则，保留用户自己添加的', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        permissions: {
          allow: [
            'Bash(bash .claude/hooks/*.sh)',
            'Read',
            'Write', // 用户自己添加的
          ],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        permissionsAllow: ['Bash(bash .claude/hooks/*.sh)', 'Read'],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.permissionsAllowRemoved).toBe(2);
      expect(result.changed).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // 用户自己添加的 Write 规则保留
      expect(updated.permissions.allow).toEqual(['Write']);
    });

    it('permissions 对象为空时（allow 和 deny 都被移除）清理 permissions 对象', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        someUserSetting: true,
        permissions: {
          allow: ['Bash(bash .claude/hooks/*.sh)'],
          deny: ['Bash(rm -rf /)'],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        permissionsAllow: ['Bash(bash .claude/hooks/*.sh)'],
        permissionsDeny: ['Bash(rm -rf /)'],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.permissionsAllowRemoved).toBe(1);
      expect(result.permissionsDenyRemoved).toBe(1);
      expect(result.changed).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // allow 和 deny 都被移除后，permissions 对象本身也被删除
      expect(updated.permissions).toBeUndefined();
      expect(updated.someUserSetting).toBe(true);
    });
  });

  // ─── File deletion when empty ────────────────────────────────

  describe('file deletion when empty', () => {
    it('deletes settings.json when only $schema remains', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = {
        $schema: 'https://claude.ai/schema/settings.json',
        autoMemoryEnabled: true,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({ autoMemoryEnabledSet: true });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.fileDeleted).toBe(true);
      expect(fs.existsSync(settingsPath)).toBe(false);
    });
  });

  // ─── Error handling ──────────────────────────────────────────

  describe('error handling', () => {
    it('handles missing settings.json gracefully', () => {
      const settingsPath = path.join(tmpDir, 'nonexistent.json');
      const manifest = makeManifest({
        hooks: [{ event: 'PreToolUse', entry: { command: 'test.sh' } }],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.changed).toBe(false);
      expect(result.hooksRemoved).toBe(0);
    });

    it('handles invalid JSON gracefully', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      fs.writeFileSync(settingsPath, 'not valid json{{{', 'utf-8');

      const manifest = makeManifest({
        hooks: [{ event: 'PreToolUse', entry: { command: 'test.sh' } }],
      });

      const result = reverseMergeSettings(settingsPath, manifest);

      expect(result.changed).toBe(false);
    });
  });

  // ─── Dry-run mode ────────────────────────────────────────────

  describe('dry-run mode', () => {
    it('makes no changes in dry-run mode', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const hookEntry = {
        matcher: 'Bash',
        hooks: [{ command: '/home/test/.claude/hooks/run.sh' }],
      };
      const settings = {
        hooks: { PreToolUse: [hookEntry] },
        env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
        autoMemoryEnabled: true,
        permissions: { allow: ['Bash(bash .claude/hooks/*.sh)'] },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const manifest = makeManifest({
        hooks: [{ event: 'PreToolUse', entry: hookEntry }],
        envVars: [{ key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', value: '1' }],
        autoMemoryEnabledSet: true,
        permissionsAllow: ['Bash(bash .claude/hooks/*.sh)'],
      });

      const result = reverseMergeSettings(settingsPath, manifest, true);

      expect(result.changed).toBe(true);
      expect(result.hooksRemoved).toBe(1);
      expect(result.envVarsRemoved).toBe(1);
      expect(result.autoMemoryEnabledReverted).toBe(true);
      expect(result.permissionsAllowRemoved).toBe(1);

      // File should NOT have been modified
      const unchanged = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(unchanged.hooks.PreToolUse).toHaveLength(1);
      expect(unchanged.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
      expect(unchanged.autoMemoryEnabled).toBe(true);
    });
  });
});
