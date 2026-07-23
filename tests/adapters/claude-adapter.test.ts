import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import {
  ClaudeAdapter,
  getLayout as getClaudeLayout,
  verifyClaudeInstallation,
} from '../../src/adapters/claude/adapter.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-claude-'));
});

afterEach(() => {
  fse.removeSync(tmpHome);
});

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-claude-'));
}

// ─── ClaudeAdapter 类 ──────────────────────────────────────────

describe('claude-adapter', () => {
  describe('ClaudeAdapter class', () => {
    const adapter = new ClaudeAdapter();

    it('has correct static properties', () => {
      expect(adapter.id).toBe('claude');
      expect(adapter.label).toBe('Claude Code');
      expect(adapter.version).toBeDefined();
      expect(adapter.supportedAgentVersion).toBeDefined();
    });

    it('description includes project-level indicator', () => {
      expect(adapter.description).toContain('.claude/');
      expect(adapter.description).toContain('~/.claude/');
    });
  });

  describe('getLayout', () => {
    it('returns global-only layout without projectDir', () => {
      const layout = getClaudeLayout({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
      });

      expect(layout.targetDir).toBe(path.join(tmpHome, '.claude'));
      expect(layout.sections.length).toBeGreaterThan(0);

      // 所有 section 的 dst/dstDir 应在 targetDir 内或 homeDir 内
      // （CLAUDE.md 例外，它放在 homeDir 根目录）
      const hasProjectSections = layout.sections.some(
        (s) => 'dst' in s && typeof s.dst === 'string' && s.dst.includes('/project/'),
      );
      expect(hasProjectSections).toBe(false);
    });

    it('returns global + project layout with projectDir', () => {
      const projectDir = tmpDir();
      const layout = getClaudeLayout({
        homeDir: tmpHome,
        projectDir,
        templateDir: path.resolve('template'),
      });

      expect(layout.targetDir).toBe(path.join(tmpHome, '.claude'));

      // 应包含项目级 section（dst 指向 projectDir）
      const hasProjectSections = layout.sections.some(
        (s) => 'dst' in s && typeof s.dst === 'string' && s.dst.startsWith(projectDir),
      );
      expect(hasProjectSections).toBe(true);
    });

    it('project sections use absolute paths outside targetDir', () => {
      const projectDir = tmpDir();
      const layout = getClaudeLayout({
        homeDir: tmpHome,
        projectDir,
        templateDir: path.resolve('template'),
      });

      const targetDir = layout.targetDir;
      const projectSections = layout.sections.filter(
        (s) =>
          ('dst' in s && typeof s.dst === 'string' && s.dst.startsWith(projectDir)) ||
          ('dstDir' in s && typeof s.dstDir === 'string' && s.dstDir.startsWith(projectDir)),
      );

      expect(projectSections.length).toBeGreaterThan(0);

      // 项目级 section 的 dst 不应在 targetDir 内
      for (const section of projectSections) {
        if ('dst' in section && typeof section.dst === 'string') {
          expect(section.dst.startsWith(targetDir)).toBe(false);
        }
        if ('dstDir' in section && typeof section.dstDir === 'string') {
          expect(section.dstDir.startsWith(targetDir)).toBe(false);
        }
      }
    });
  });

  describe('install', () => {
    it('creates global installation without projectDir', () => {
      const adapter = new ClaudeAdapter();
      const homeDir = tmpDir();
      const templateDir = path.resolve('template');

      const result = adapter.install({
        homeDir,
        templateDir,
        dryRun: false,
      });

      const claudeDir = path.join(homeDir, '.claude');
      expect(fs.existsSync(path.join(homeDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'MEMORY.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'rules'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'hooks'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'commands'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'memory'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'skills'))).toBe(true);

      expect(result.filesCreated).toBeGreaterThan(0);
      expect(result.adapterHome).toBe(claudeDir);
    });

    it('creates global + project installation with projectDir', () => {
      const adapter = new ClaudeAdapter();
      const homeDir = tmpDir();
      const projectDir = tmpDir();
      const templateDir = path.resolve('template');

      const result = adapter.install({
        homeDir,
        templateDir,
        projectDir,
        dryRun: false,
      });

      // 全局文件
      const claudeDir = path.join(homeDir, '.claude');
      expect(fs.existsSync(path.join(homeDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);

      // 项目级文件
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.claude', 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.claude', 'rules'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.claude', 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.claude', 'commands'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.claude', 'memory'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.claude', 'skills'))).toBe(true);

      expect(result.filesCreated).toBeGreaterThan(0);
    });

    it('project CLAUDE.md is placed at projectDir root', () => {
      const adapter = new ClaudeAdapter();
      const homeDir = tmpDir();
      const projectDir = tmpDir();
      const templateDir = path.resolve('template');

      adapter.install({
        homeDir,
        templateDir,
        projectDir,
        dryRun: false,
      });

      // 项目级 CLAUDE.md 在项目根目录
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(true);
    });

    it('respects dry-run mode with projectDir', () => {
      const adapter = new ClaudeAdapter();
      const homeDir = tmpDir();
      const projectDir = tmpDir();
      const templateDir = path.resolve('template');

      adapter.install({
        homeDir,
        templateDir,
        projectDir,
        dryRun: true,
      });

      // dry-run 不应创建文件
      const claudeDir = path.join(homeDir, '.claude');
      expect(fs.existsSync(claudeDir)).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.claude'))).toBe(false);
    });
  });

  describe('verifyClaudeInstallation', () => {
    it('checks global installation only without projectDir', () => {
      const checks = verifyClaudeInstallation(tmpHome);
      // 全局检查项（目录 + 关键文件）
      const globalChecks = checks.filter((c) => !c.name.includes('(project)'));
      expect(globalChecks.length).toBeGreaterThan(0);
    });

    it('checks global + project installation with projectDir', () => {
      const projectDir = tmpDir();
      const checks = verifyClaudeInstallation(tmpHome, projectDir);
      const projectChecks = checks.filter((c) => c.name.includes('(project)'));
      expect(projectChecks.length).toBeGreaterThan(0);
    });

    it('detects missing project-level files', () => {
      const projectDir = tmpDir();
      const checks = verifyClaudeInstallation(tmpHome, projectDir);
      const projectChecks = checks.filter((c) => c.name.includes('(project)'));
      // 项目级文件未安装，应检测到缺失
      const failedChecks = projectChecks.filter((c) => !c.pass);
      expect(failedChecks.length).toBeGreaterThan(0);
    });
  });

  describe('status', () => {
    it('returns projectDir when provided', () => {
      const adapter = new ClaudeAdapter();
      const projectDir = '/tmp/test-project';
      const status = adapter.status({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
        projectDir,
      });

      expect(status.projectDir).toBe(projectDir);
    });

    it('does not return projectDir when not provided', () => {
      const adapter = new ClaudeAdapter();
      const status = adapter.status({
        homeDir: tmpHome,
        templateDir: path.resolve('template'),
      });

      expect(status.projectDir).toBeUndefined();
    });
  });
});
