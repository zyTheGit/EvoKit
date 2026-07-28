import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import { mergeSettings } from '../../src/core/merge-settings.js';
import { ManifestCollector } from '../../src/core/manifest-collector.js';

let tmpDir: string;

/** 创建 collector 并提供便捷的读取方法 */
function createCollector() {
  const collector = new ManifestCollector();
  const build = () =>
    collector.build({
      adapterId: 'test',
      adapterVersion: '1.0.0',
      homeDir: tmpDir,
      adapterHome: tmpDir,
    });
  return { collector, build };
}

describe('merge-settings', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-ms-'));
  });

  afterEach(() => {
    fse.removeSync(tmpDir);
  });

  // ─── Hooks 合并 ──────────────────────────────────────────────

  describe('hooks merge', () => {
    it('adds missing hook events from template', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = { someUserSetting: true };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        hooks: {
          SessionStart: [{ matcher: '', hooks: [{ command: 'run.sh' }] }],
        },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      expect(result.changed).toBe(true);
      const manifest = build();
      expect(manifest.hooks).toHaveLength(1);
      expect(manifest.hooks[0].event).toBe('SessionStart');

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.hooks.SessionStart).toHaveLength(1);
    });

    it('does not overwrite existing hook events', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const userHook = [{ matcher: 'Bash', hooks: [{ command: 'user-script.sh' }] }];
      const settings = {
        autoMemoryEnabled: true,
        hooks: { PreToolUse: userHook },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        autoMemoryEnabled: true,
        hooks: {
          PreToolUse: [{ matcher: 'Edit', hooks: [{ command: 'evokit-check.sh' }] }],
        },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      // PreToolUse 已存在，不应添加；autoMemoryEnabled 也一致
      expect(result.changed).toBe(false);
      const manifest = build();
      expect(manifest.hooks).toHaveLength(0);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.hooks.PreToolUse).toEqual(userHook);
    });
  });

  // ─── Env 合并 ────────────────────────────────────────────────

  describe('env merge', () => {
    it('adds missing env vars from template', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = { env: { USER_VAR: 'myvalue' } };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        env: { UV_MANAGED_PYTHON: '1' },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      expect(result.changed).toBe(true);
      const manifest = build();
      expect(manifest.envVars).toHaveLength(1);
      expect(manifest.envVars[0].key).toBe('UV_MANAGED_PYTHON');

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.env.UV_MANAGED_PYTHON).toBe('1');
      expect(updated.env.USER_VAR).toBe('myvalue');
    });

    it('does not overwrite existing env vars', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = { env: { UV_MANAGED_PYTHON: '0' } };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        env: { UV_MANAGED_PYTHON: '1' },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      // env 变量已存在，不应覆盖
      const manifest = build();
      expect(manifest.envVars).toHaveLength(0);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.env.UV_MANAGED_PYTHON).toBe('0');
    });
  });

  // ─── autoMemoryEnabled ───────────────────────────────────────

  describe('autoMemoryEnabled', () => {
    it('sets autoMemoryEnabled when missing from user settings', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = {};
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = { autoMemoryEnabled: true };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      expect(result.changed).toBe(true);
      const manifest = build();
      expect(manifest.autoMemoryEnabledSet).toBe(true);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.autoMemoryEnabled).toBe(true);
    });
  });

  // ─── Permissions 合并 ────────────────────────────────────────

  describe('permissions merge', () => {
    it('allowWorkflow=false 时不合并 permissions', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = {};
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        permissions: {
          allow: ['Bash(bash .claude/hooks/*.sh)', 'Read'],
        },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      // allowWorkflow 默认为 false
      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      // permissions 不应被合并
      const manifest = build();
      expect(manifest.permissionsAllow).toEqual([]);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.permissions).toBeUndefined();
    });

    it('allowWorkflow=true 时合并 permissions.allow', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = {};
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        permissions: {
          allow: ['Bash(bash .claude/hooks/*.sh)', 'Read'],
        },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, true, collector);

      expect(result.changed).toBe(true);
      const manifest = build();
      expect(manifest.permissionsAllow).toEqual(['Bash(bash .claude/hooks/*.sh)', 'Read']);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(updated.permissions.allow).toEqual(['Bash(bash .claude/hooks/*.sh)', 'Read']);
    });

    it('已有 permissions.allow 时不覆盖，仅添加缺失的', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = {
        permissions: {
          allow: ['Read', 'Write'],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        permissions: {
          allow: ['Bash(bash .claude/hooks/*.sh)', 'Read'],
        },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, true, collector);

      expect(result.changed).toBe(true);
      const manifest = build();
      // Read 已存在，仅添加缺失的：Bash 规则，Read 已存在不重复添加
      expect(manifest.permissionsAllow).toEqual(['Bash(bash .claude/hooks/*.sh)']);

      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // 用户已有的 Read 和 Write 保留，仅新增 Bash
      expect(updated.permissions.allow).toEqual(['Read', 'Write', 'Bash(bash .claude/hooks/*.sh)']);
    });

    it('permissionsAllow 正确记录实际添加的规则', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');

      const settings = {
        permissions: {
          allow: ['Read'],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const template = {
        permissions: {
          allow: ['Read', 'Write', 'Bash(bash .claude/hooks/*.sh)'],
        },
      };
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf-8');

      const { collector, build } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, true, collector);

      const manifest = build();
      // Read 已存在，仅 Write 和 Bash 是新增的
      expect(manifest.permissionsAllow).toEqual(['Write', 'Bash(bash .claude/hooks/*.sh)']);
      expect(manifest.permissionsAllow).toHaveLength(2);
    });
  });

  // ─── 错误处理 ────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns unchanged when settings file not found', () => {
      const settingsPath = path.join(tmpDir, 'nonexistent.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');
      fs.writeFileSync(templatePath, JSON.stringify({}), 'utf-8');

      const { collector } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      expect(result.changed).toBe(false);
      expect(result.reason).toContain('文件未找到');
    });

    it('returns unchanged when template file not found', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'nonexistent.json');
      fs.writeFileSync(settingsPath, JSON.stringify({}), 'utf-8');

      const { collector } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      expect(result.changed).toBe(false);
      expect(result.reason).toContain('模板未找到');
    });

    it('returns unchanged for invalid JSON in settings', () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const templatePath = path.join(tmpDir, 'template-settings.json');
      fs.writeFileSync(settingsPath, 'not valid json{{{', 'utf-8');
      fs.writeFileSync(templatePath, JSON.stringify({}), 'utf-8');

      const { collector } = createCollector();
      const result = mergeSettings(settingsPath, templatePath, tmpDir, false, collector);

      expect(result.changed).toBe(false);
      expect(result.reason).toContain('无效 JSON');
    });
  });
});
