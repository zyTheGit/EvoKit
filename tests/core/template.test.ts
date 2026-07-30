import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  installPipeline,
  installTemplate,
  verifyInstallation,
  setPermissions,
} from '../../src/core/template.js';
import type { InstallPipelineOptions } from '../../src/core/template.js';

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
      expect(summary.hooksInstalled).toBe(2);
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
      expect(summary.hooksInstalled).toBe(2);
    });
  });

  describe('installPipeline — profile mode', () => {
    it('full profile installs everything', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      const claudeDir = path.join(homeDir, '.claude');

      const summary = installPipeline({
        homeDir,
        templateDir,
        targetDir: claudeDir,
        profile: 'full',
      });

      // All components should be installed
      expect(fs.existsSync(path.join(homeDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'MEMORY.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'hooks'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'rules'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'commands'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'skills'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'memory'))).toBe(true);

      expect(summary.hooksInstalled).toBe(2);
      expect(summary.rulesInstalled).toBe(3);
      expect(summary.agentsInstalled).toBe(2);
      expect(summary.commandsInstalled).toBe(3);
    });

    it('minimal profile installs only core components', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      const claudeDir = path.join(homeDir, '.claude');

      const summary = installPipeline({
        homeDir,
        templateDir,
        targetDir: claudeDir,
        profile: 'minimal',
      });

      // Core components should be installed
      expect(fs.existsSync(path.join(homeDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'hooks'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'memory'))).toBe(true);

      // Non-core components should NOT be installed
      expect(fs.existsSync(path.join(claudeDir, 'rules'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'commands'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'agents'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'skills'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'MEMORY.md'))).toBe(false);
    });

    it('upgrade profile overwrites CLAUDE.md even if it exists', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      const claudeDir = path.join(homeDir, '.claude');

      // First install with full profile
      installPipeline({
        homeDir,
        templateDir,
        targetDir: claudeDir,
        profile: 'full',
      });

      // Modify CLAUDE.md
      const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
      const originalContent = fs.readFileSync(claudeMdPath, 'utf-8');
      fs.writeFileSync(claudeMdPath, 'MODIFIED CONTENT', 'utf-8');

      // Upgrade should NOT overwrite CLAUDE.md (preserve user customizations)
      const summary = installPipeline({
        homeDir,
        templateDir,
        targetDir: claudeDir,
        profile: 'upgrade',
      });

      const newContent = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(newContent).toBe('MODIFIED CONTENT');
      // Upgrade uses 'skip-if-exists' strategy for CLAUDE.md, so user modifications preserved
      // Other files (hooks, rules) are still updated via 'always' strategy
      expect(summary.hooksInstalled).toBeGreaterThan(0);
    });

    it('exclude removes specific components from profile', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      const claudeDir = path.join(homeDir, '.claude');

      const summary = installPipeline({
        homeDir,
        templateDir,
        targetDir: claudeDir,
        profile: 'full',
        exclude: ['rules', 'commands', 'agents', 'skills'],
      });

      // Excluded components should NOT be installed
      expect(fs.existsSync(path.join(claudeDir, 'rules'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'commands'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'agents'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'skills'))).toBe(false);

      // Non-excluded components should be installed
      expect(fs.existsSync(path.join(homeDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'hooks'))).toBe(true);

      expect(summary.rulesInstalled).toBe(0);
      expect(summary.commandsInstalled).toBe(0);
      expect(summary.agentsInstalled).toBe(0);
    });

    it('legacy boolean flags override profile', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      const claudeDir = path.join(homeDir, '.claude');

      // Use legacy flags to install only hooks
      const summary = installPipeline({
        homeDir,
        templateDir,
        targetDir: claudeDir,
        installHooks: true,
        installClaudeMd: false,
        installMemoryMd: false,
        installSettings: false,
        installRules: false,
        installCommands: false,
        installAgents: false,
        installSkills: false,
        seedMemory: false,
      });

      // Only hooks should be installed
      expect(fs.existsSync(path.join(claudeDir, 'hooks'))).toBe(true);
      expect(fs.existsSync(path.join(homeDir, 'CLAUDE.md'))).toBe(false);
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(false);
      expect(summary.hooksInstalled).toBe(2);
    });

    it('defaults to full profile when no profile or flags specified', () => {
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');
      const claudeDir = path.join(homeDir, '.claude');

      const summary = installPipeline({
        homeDir,
        templateDir,
        targetDir: claudeDir,
      });

      // Should behave like full profile
      expect(fs.existsSync(path.join(homeDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);
      expect(summary.hooksInstalled).toBe(2);
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
