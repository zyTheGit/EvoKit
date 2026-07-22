import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import { executeUninstall } from '../../src/core/uninstall-engine.js';
import type { UninstallOptions, UninstallResult } from '../../src/core/uninstall-engine.js';
import type { AdapterManifest, EvoKitManifest } from '../../src/core/manifest.js';
import { writeManifest, manifestPath } from '../../src/core/manifest.js';

let tmpHome: string;

function makeAdapterManifest(overrides: Partial<AdapterManifest> = {}): AdapterManifest {
  const homeDir = tmpHome;
  const adapterHome = path.join(homeDir, '.claude');
  return {
    adapterId: 'claude',
    adapterVersion: '0.4.13',
    installedAt: '2026-01-01T00:00:00Z',
    homeDir,
    adapterHome,
    files: [],
    directories: [],
    hooks: [],
    envVars: [],
    autoMemoryEnabledSet: false,
    permissionsAllow: [],
    permissionsDeny: [],
    agentFrontmatter: [],
    memorySeeds: [],
    skillDirs: [],
    ...overrides,
  };
}

/** Set up a full fake Claude adapter installation in tmpHome */
function setupFullInstallation(): AdapterManifest {
  const homeDir = tmpHome;
  const adapterHome = path.join(homeDir, '.claude');

  // Create directory structure
  fse.ensureDirSync(path.join(adapterHome, 'hooks'));
  fse.ensureDirSync(path.join(adapterHome, 'rules'));
  fse.ensureDirSync(path.join(adapterHome, 'commands'));
  fse.ensureDirSync(path.join(adapterHome, 'agents'));
  fse.ensureDirSync(path.join(adapterHome, 'memory'));
  fse.ensureDirSync(path.join(adapterHome, 'skills', 'debug'));
  fse.ensureDirSync(path.join(homeDir, '.evokit'));

  // Create hook files
  const hookPath = path.join(adapterHome, 'hooks', 'session-start.sh');
  fs.writeFileSync(hookPath, '#!/bin/bash\necho "session start"', 'utf-8');

  // Create rule files
  const rulePath = path.join(adapterHome, 'rules', 'chinese-preference.md');
  fs.writeFileSync(rulePath, '# Chinese Preference Rule', 'utf-8');

  // Create command files
  const cmdPath = path.join(adapterHome, 'commands', 'boot.md');
  fs.writeFileSync(cmdPath, '# Boot Command', 'utf-8');

  // Create agent files with frontmatter
  const agentPath = path.join(adapterHome, 'agents', 'reviewer.md');
  fs.writeFileSync(agentPath, '---\nname: reviewer\nmodel: sonnet\n---\nReviewer agent', 'utf-8');

  // Create memory files
  const memoryReadme = path.join(adapterHome, 'memory', 'README.md');
  fs.writeFileSync(memoryReadme, '# Memory Directory', 'utf-8');

  const memoryMd = path.join(adapterHome, 'memory', 'MEMORY.md');
  fs.writeFileSync(memoryMd, '# User Memory Data', 'utf-8');

  const correctionsPath = path.join(adapterHome, 'memory', 'corrections.jsonl');
  fs.writeFileSync(correctionsPath, '{"pattern":"test","context":"ctx","count":1}', 'utf-8');

  // Create skills
  const skillMd = path.join(adapterHome, 'skills', 'debug', 'SKILL.md');
  fs.writeFileSync(skillMd, '# Debug Skill', 'utf-8');

  // Create settings.json with hooks
  const hookEntry = {
    matcher: 'SessionStart',
    hooks: [{ command: path.join(adapterHome, 'hooks', 'session-start.sh') }],
  };
  const settings = {
    hooks: { SessionStart: [hookEntry] },
    autoMemoryEnabled: true,
    env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
    permissionsAllow: ['Bash(bash .claude/hooks/*.sh)'],
  };
  const settingsPath = path.join(adapterHome, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  // Create CLAUDE.md with EvoKit section appended
  const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
  fs.writeFileSync(
    claudeMdPath,
    '# My Project\n\nUser content\n\n---\n\nSelf-Evolving System Protocol\n\nProtocol body',
    'utf-8',
  );

  // Build manifest
  const manifest: AdapterManifest = makeAdapterManifest({
    files: [
      { path: hookPath, source: 'copy-dir', mode: 'created' },
      { path: rulePath, source: 'copy-dir', mode: 'created' },
      { path: cmdPath, source: 'copy-dir', mode: 'created' },
      { path: memoryReadme, source: 'seed-memory', mode: 'created' },
      { path: memoryMd, source: 'seed-memory', mode: 'created' },
      { path: correctionsPath, source: 'seed-memory', mode: 'created' },
      { path: settingsPath, source: 'merge-settings', mode: 'created' },
      {
        path: claudeMdPath,
        source: 'copy',
        mode: 'appended',
        appendMarker: 'Self-Evolving System Protocol',
      },
    ],
    directories: [
      path.join(adapterHome, 'hooks'),
      path.join(adapterHome, 'rules'),
      path.join(adapterHome, 'commands'),
      path.join(adapterHome, 'agents'),
      path.join(adapterHome, 'memory'),
      path.join(adapterHome, 'skills'),
      path.join(adapterHome, 'skills', 'debug'),
    ],
    hooks: [{ event: 'SessionStart', entry: hookEntry }],
    envVars: [{ key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', value: '1' }],
    autoMemoryEnabledSet: true,
    permissionsAllow: ['Bash(bash .claude/hooks/*.sh)'],
    agentFrontmatter: [{ file: 'reviewer.md', fields: { model: 'sonnet' } }],
    memorySeeds: [memoryReadme, memoryMd, correctionsPath],
    skillDirs: [path.join(adapterHome, 'skills', 'debug')],
  });

  // Write manifest
  const evokitManifest: EvoKitManifest = {
    version: 1,
    evokitVersion: '0.4.13',
    updatedAt: '2026-01-01T00:00:00Z',
    adapters: { claude: manifest },
  };
  writeManifest(homeDir, evokitManifest);

  return manifest;
}

describe('uninstall-engine', () => {
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-ue-'));
  });

  afterEach(() => {
    fse.removeSync(tmpHome);
  });

  // ─── Full manifest-driven uninstall ──────────────────────────

  describe('full manifest-driven uninstall', () => {
    it('performs complete uninstall for Claude adapter', () => {
      setupFullInstallation();

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      expect(result.adapterId).toBe('claude');
      expect(result.heuristic).toBe(false);
      expect(result.hooksRemoved).toBe(1);
      expect(result.envVarsRemoved).toBe(1);
      expect(result.agentFieldsRemoved).toBe(1);
      expect(result.filesDeleted).toBeGreaterThan(0);

      // Settings.json should be cleaned
      const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
      if (fse.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        expect(settings.hooks).toBeUndefined();
        expect(settings.autoMemoryEnabled).toBeUndefined();
      }

      // CLAUDE.md should have EvoKit section removed
      const claudeMdPath = path.join(tmpHome, 'CLAUDE.md');
      if (fse.existsSync(claudeMdPath)) {
        const content = fs.readFileSync(claudeMdPath, 'utf-8');
        expect(content).not.toContain('Self-Evolving System Protocol');
        expect(content).toContain('# My Project');
      }

      // Manifest should be removed (no adapters left)
      expect(fse.existsSync(manifestPath(tmpHome))).toBe(false);
    });
  });

  // ─── Purge flag ──────────────────────────────────────────────

  describe('purge flag', () => {
    it('deletes user data files with --purge', () => {
      setupFullInstallation();

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: true,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      // User data files should be deleted
      const memoryMd = path.join(tmpHome, '.claude', 'memory', 'MEMORY.md');
      const corrections = path.join(tmpHome, '.claude', 'memory', 'corrections.jsonl');
      expect(fse.existsSync(memoryMd)).toBe(false);
      expect(fse.existsSync(corrections)).toBe(false);
    });

    it('preserves user data files by default', () => {
      setupFullInstallation();

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      // User data files should be preserved
      expect(result.filesPreserved).toBeGreaterThan(0);

      const memoryMd = path.join(tmpHome, '.claude', 'memory', 'MEMORY.md');
      const corrections = path.join(tmpHome, '.claude', 'memory', 'corrections.jsonl');
      expect(fse.existsSync(memoryMd)).toBe(true);
      expect(fse.existsSync(corrections)).toBe(true);
    });
  });

  // ─── No-backup flag ──────────────────────────────────────────

  describe('no-backup flag', () => {
    it('skips backup creation with --no-backup', () => {
      setupFullInstallation();

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      expect(result.backupPath).toBeUndefined();
    });

    it('creates backup by default', () => {
      setupFullInstallation();

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: false,
      };

      const result = executeUninstall(options);

      expect(result.backupPath).toBeDefined();
      expect(fse.existsSync(result.backupPath!)).toBe(true);
    });

    it('backup contains correct files', () => {
      setupFullInstallation();

      const backupDir = path.join(tmpHome, 'test-backup');
      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: false,
        backupDir,
      };

      const result = executeUninstall(options);

      expect(result.backupPath).toBe(backupDir);
      // Backup should contain settings.json
      const backupSettings = path.join(backupDir, '.claude', 'settings.json');
      expect(fse.existsSync(backupSettings)).toBe(true);
    });
  });

  // ─── Empty directory cleanup ─────────────────────────────────

  describe('empty directory cleanup', () => {
    it('removes empty directories after file deletion', () => {
      setupFullInstallation();

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: true,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      expect(result.directoriesRemoved).toBeGreaterThan(0);
    });
  });

  // ─── Heuristic uninstall ─────────────────────────────────────

  describe('heuristic uninstall', () => {
    it('falls back to heuristic when no manifest exists', () => {
      // Set up a basic .claude directory without manifest
      const adapterHome = path.join(tmpHome, '.claude');
      fse.ensureDirSync(path.join(adapterHome, 'hooks'));
      fse.ensureDirSync(path.join(adapterHome, 'rules'));
      fse.ensureDirSync(path.join(adapterHome, 'commands'));
      fse.ensureDirSync(path.join(adapterHome, 'agents'));
      fse.ensureDirSync(path.join(adapterHome, 'memory'));

      // Create some files
      fs.writeFileSync(
        path.join(adapterHome, 'hooks', 'session-start.sh'),
        '#!/bin/bash\necho hi',
        'utf-8',
      );
      fs.writeFileSync(path.join(adapterHome, 'rules', 'test-rule.md'), '# Test Rule', 'utf-8');
      fs.writeFileSync(path.join(adapterHome, 'memory', 'README.md'), '# Memory', 'utf-8');

      // Create settings.json with hooks referencing .claude/hooks/
      const settings = {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ command: path.join(adapterHome, 'hooks', 'session-start.sh') }],
            },
          ],
        },
        autoMemoryEnabled: true,
      };
      fs.writeFileSync(
        path.join(adapterHome, 'settings.json'),
        JSON.stringify(settings, null, 2),
        'utf-8',
      );

      // Create CLAUDE.md with EvoKit section
      fs.writeFileSync(
        path.join(tmpHome, 'CLAUDE.md'),
        '# Self-Evolving System Protocol\n\nBody',
        'utf-8',
      );

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      expect(result.heuristic).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.filesDeleted).toBeGreaterThan(0);
    });

    it('warns when no manifest found', () => {
      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      expect(result.heuristic).toBe(true);
      expect(result.warnings).toContain('未找到清单文件 — 使用启发式卸载。部分文件可能被遗漏。');
    });
  });

  // ─── Dry-run mode ────────────────────────────────────────────

  describe('dry-run mode', () => {
    it('makes no changes in dry-run mode', () => {
      setupFullInstallation();

      // Record file existence before dry-run
      const hookPath = path.join(tmpHome, '.claude', 'hooks', 'session-start.sh');
      const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
      const claudeMdPath = path.join(tmpHome, 'CLAUDE.md');
      expect(fse.existsSync(hookPath)).toBe(true);
      expect(fse.existsSync(settingsPath)).toBe(true);
      expect(fse.existsSync(claudeMdPath)).toBe(true);

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: true,
        noBackup: true,
      };

      const result = executeUninstall(options);

      // Files should still exist
      expect(fse.existsSync(hookPath)).toBe(true);
      expect(fse.existsSync(settingsPath)).toBe(true);
      expect(fse.existsSync(claudeMdPath)).toBe(true);

      // Manifest should still exist
      expect(fse.existsSync(manifestPath(tmpHome))).toBe(true);
    });
  });

  // ─── Adapter not in manifest ─────────────────────────────────

  describe('adapter not in manifest', () => {
    it('falls back to heuristic when adapter not in manifest', () => {
      // Write a manifest with a different adapter
      const evokitManifest: EvoKitManifest = {
        version: 1,
        evokitVersion: '0.4.13',
        updatedAt: '2026-01-01T00:00:00Z',
        adapters: {
          codex: makeAdapterManifest({
            adapterId: 'codex',
            adapterHome: path.join(tmpHome, '.codex'),
          }),
        },
      };
      writeManifest(tmpHome, evokitManifest);

      const options: UninstallOptions = {
        homeDir: tmpHome,
        adapterId: 'claude',
        force: false,
        purge: false,
        dryRun: false,
        noBackup: true,
      };

      const result = executeUninstall(options);

      expect(result.heuristic).toBe(true);
    });
  });
});
