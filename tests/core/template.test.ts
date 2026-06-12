import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { installTemplate, verifyInstallation, setPermissions } from '../../src/core/template.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-tpl-'));
}

describe('template', () => {
  describe('installTemplate', () => {
    it('creates directory structure and copies files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = installTemplate(homeDir, templateDir, false);

      // Check directories created
      const subdirs = ['rules', 'agents', 'commands', 'memory', 'hooks'];
      for (const dir of subdirs) {
        expect(fs.existsSync(path.join(homeDir, '.claude', dir))).toBe(true);
      }

      // Check key files copied
      expect(fs.existsSync(path.join(homeDir, '.claude', 'MEMORY.md'))).toBe(true);
      expect(fs.existsSync(path.join(homeDir, '.claude', 'settings.json'))).toBe(true);

      // Check __HOME__ replacement in settings.json
      const settings = fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf-8');
      expect(settings).not.toContain('__HOME__');
      expect(settings).toContain(homeDir);

      // Summary should have reasonable counts
      expect(summary.hooksInstalled).toBe(3);
      expect(summary.rulesInstalled).toBe(3);
      expect(summary.agentsInstalled).toBe(2);
      expect(summary.commandsInstalled).toBe(3);
    });

    it('is idempotent — skips existing files', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const first = installTemplate(homeDir, templateDir, false);
      const second = installTemplate(homeDir, templateDir, false);

      // Second run should skip most files
      expect(second.filesSkipped).toBeGreaterThan(0);
    });

    it('respects dry-run mode', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const summary = installTemplate(homeDir, templateDir, true);

      // Nothing should be created in dry-run
      expect(fs.existsSync(path.join(homeDir, '.claude', 'rules'))).toBe(false);
      // But summary should still report what WOULD happen
      expect(summary.hooksInstalled).toBe(3);
    });
  });

  describe('verifyInstallation', () => {
    it('detects incomplete installation', () => {
      const homeDir = tmpDir();
      const checks = verifyInstallation(homeDir);
      const failing = checks.filter((c) => !c.pass);
      expect(failing.length).toBeGreaterThan(0);
    });

    it('passes for complete installation', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      installTemplate(homeDir, templateDir, false);

      const checks = verifyInstallation(homeDir);
      const failing = checks.filter((c) => !c.pass);
      expect(failing).toHaveLength(0);
    });
  });

  describe('setPermissions', () => {
    it('sets correct permissions on hooks and JSONL', () => {
      // This test is OS-dependent; on Windows it may behave differently
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      installTemplate(homeDir, templateDir, false);

      // Re-run setPermissions
      setPermissions(path.join(homeDir, '.claude'));

      // Check hooks are executable
      const hooksDir = path.join(homeDir, '.claude', 'hooks');
      if (process.platform !== 'win32') {
        const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.sh'));
        for (const h of hookFiles) {
          const stats = fs.statSync(path.join(hooksDir, h));
          const isExecutable = !!(stats.mode & 0o111);
          expect(isExecutable).toBe(true);
        }
      }

      // Check JSONL files are 600
      const memDir = path.join(homeDir, '.claude', 'memory');
      if (process.platform !== 'win32') {
        const jsonlFiles = fs.readdirSync(memDir).filter((f) => f.endsWith('.jsonl'));
        for (const j of jsonlFiles) {
          const stats = fs.statSync(path.join(memDir, j));
          // 600 = owner read+write
          expect(stats.mode & 0o600).toBe(0o600);
        }
      }
    });
  });
});
