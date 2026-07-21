import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import { executeLayout } from '../../src/core/layout-engine.js';
import type { AdapterLayout, AdapterSection } from '../../src/core/layout-types.js';

let tmpHome: string;

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-engine-'));
}

function srcFile(name: string, content: string): string {
  const p = path.join(tmpHome, 'src', name);
  fse.ensureDirSync(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function srcDir(name: string, files: Record<string, string>): string {
  const dir = path.join(tmpHome, 'src', name);
  fse.ensureDirSync(dir);
  for (const [fname, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, fname), content, 'utf-8');
  }
  return dir;
}

function targetPath(...segments: string[]): string {
  return path.join(tmpHome, 'target', ...segments);
}

describe('layout-engine', () => {
  beforeEach(() => {
    tmpHome = tmpDir();
    fse.ensureDirSync(path.join(tmpHome, 'target'));
  });

  afterEach(() => {
    fse.removeSync(tmpHome);
  });

  // ─── dirs ───────────────────────────────────────────────────

  describe('dirs section', () => {
    it('creates listed directories under targetDir', () => {
      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'dirs', paths: ['rules', 'agents', 'hooks'] }],
      };

      executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(targetPath('rules'))).toBe(true);
      expect(fs.existsSync(targetPath('agents'))).toBe(true);
      expect(fs.existsSync(targetPath('hooks'))).toBe(true);
    });

    it('does nothing in dry-run mode', () => {
      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'dirs', paths: ['rules'] }],
      };

      executeLayout(layout, { homeDir: tmpHome, dryRun: true });
      expect(fs.existsSync(targetPath('rules'))).toBe(false);
    });
  });

  // ─── copy ───────────────────────────────────────────────────

  describe('copy section', () => {
    it('copies a file with "always" strategy', () => {
      const src = srcFile('hello.txt', 'hello world');
      const dst = targetPath('hello.txt');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'copy', src, dst, strategy: 'always' }],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(dst)).toBe(true);
      expect(fs.readFileSync(dst, 'utf-8')).toBe('hello world');
      expect(summary.filesCreated).toBe(1);
    });

    it('replaces __HOME__ when replaceHome is true', () => {
      const src = srcFile('config.json', '{"path": "__HOME__/data"}');
      const dst = targetPath('config.json');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'copy', src, dst, strategy: 'always', replaceHome: true }],
      };

      executeLayout(layout, { homeDir: '/home/testuser' });

      const content = fs.readFileSync(dst, 'utf-8');
      expect(content).toBe('{"path": "/home/testuser/data"}');
      expect(content).not.toContain('__HOME__');
    });

    it('skips existing files with "skip-if-exists" strategy', () => {
      const src = srcFile('keep.txt', 'new content');
      const dst = targetPath('keep.txt');
      fs.writeFileSync(dst, 'existing content', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'copy', src, dst, strategy: 'skip-if-exists' }],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(fs.readFileSync(dst, 'utf-8')).toBe('existing content');
      expect(summary.filesSkipped).toBe(1);
      expect(summary.filesCreated).toBe(0);
    });

    it('appends content when appendMarker is missing from existing file', () => {
      const src = srcFile('append.md', '# Protocol Section\nSome content');
      const dst = targetPath('append.md');
      fs.writeFileSync(dst, '# Existing File\nSome stuff', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy',
            src,
            dst,
            strategy: 'skip-if-exists',
            appendMarker: 'Protocol Section',
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      const content = fs.readFileSync(dst, 'utf-8');
      expect(content).toContain('# Existing File');
      expect(content).toContain('Protocol Section');
      expect(summary.filesCreated).toBe(1);
    });

    it('skips when appendMarker is already present', () => {
      const src = srcFile('append.md', '# Protocol Section\nSome content');
      const dst = targetPath('append.md');
      fs.writeFileSync(dst, '# Existing File\nProtocol Section\nMore stuff', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy',
            src,
            dst,
            strategy: 'skip-if-exists',
            appendMarker: 'Protocol Section',
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });
      expect(summary.filesSkipped).toBe(1);
    });

    it('does nothing if source file does not exist', () => {
      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy',
            src: path.join(tmpHome, 'nonexistent.txt'),
            dst: targetPath('out.txt'),
            strategy: 'always',
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });
      expect(summary.filesCreated).toBe(0);
    });
  });

  // ─── copy-dir ───────────────────────────────────────────────

  describe('copy-dir section', () => {
    it('copies all files from source directory', () => {
      const src = srcDir('rules', { 'rule1.md': 'r1', 'rule2.md': 'r2' });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-dir',
            srcDir: src,
            dstDir: targetPath('rules'),
            strategy: 'always',
            counter: 'rulesInstalled',
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(targetPath('rules', 'rule1.md'))).toBe(true);
      expect(fs.existsSync(targetPath('rules', 'rule2.md'))).toBe(true);
      expect(summary.rulesInstalled).toBe(2);
    });

    it('applies filter to select files', () => {
      const src = srcDir('hooks', { 'hook.sh': '#!/bin/bash', 'readme.txt': 'info' });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-dir',
            srcDir: src,
            dstDir: targetPath('hooks'),
            filter: '.sh',
            strategy: 'always',
            replaceHome: true,
            counter: 'hooksInstalled',
          },
        ],
      };

      executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(targetPath('hooks', 'hook.sh'))).toBe(true);
      expect(fs.existsSync(targetPath('hooks', 'readme.txt'))).toBe(false);
    });

    it('replaces __HOME__ when replaceHome is true', () => {
      const src = srcDir('hooks', { 'run.sh': '#!/bin/bash\necho __HOME__' });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-dir',
            srcDir: src,
            dstDir: targetPath('hooks'),
            strategy: 'always',
            replaceHome: true,
          },
        ],
      };

      executeLayout(layout, { homeDir: '/opt/home' });

      const content = fs.readFileSync(targetPath('hooks', 'run.sh'), 'utf-8');
      expect(content).toBe('#!/bin/bash\necho /opt/home');
    });

    it('skips existing files with "skip-if-exists" strategy', () => {
      const src = srcDir('data', { 'file.txt': 'new' });
      fse.ensureDirSync(targetPath('data'));
      fs.writeFileSync(targetPath('data', 'file.txt'), 'old', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-dir',
            srcDir: src,
            dstDir: targetPath('data'),
            strategy: 'skip-if-exists',
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });
      expect(fs.readFileSync(targetPath('data', 'file.txt'), 'utf-8')).toBe('old');
      expect(summary.filesSkipped).toBe(1);
    });
  });

  // ─── seed-memory ────────────────────────────────────────────

  describe('seed-memory section', () => {
    it('copies files that do not exist at target', () => {
      const src = srcDir('memory', { 'README.md': '# Memory', 'sessions.jsonl': '' });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'seed-memory',
            srcDir: src,
            dstDir: targetPath('memory'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(targetPath('memory', 'README.md'))).toBe(true);
      expect(fs.existsSync(targetPath('memory', 'sessions.jsonl'))).toBe(true);
      expect(summary.filesCreated).toBe(2);
    });

    it('never overwrites existing memory files', () => {
      const src = srcDir('memory', { 'sessions.jsonl': 'new data' });
      fse.ensureDirSync(targetPath('memory'));
      fs.writeFileSync(targetPath('memory', 'sessions.jsonl'), 'old data', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'seed-memory',
            srcDir: src,
            dstDir: targetPath('memory'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });
      expect(fs.readFileSync(targetPath('memory', 'sessions.jsonl'), 'utf-8')).toBe('old data');
      expect(summary.filesSkipped).toBe(1);
    });
  });

  // ─── permissions ────────────────────────────────────────────

  describe('permissions section', () => {
    it('sets executable permission on .sh files', () => {
      // Skip on Windows
      if (process.platform === 'win32') return;

      const dir = targetPath('hooks');
      fse.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, 'run.sh'), '#!/bin/bash\necho hi', 'utf-8');
      fs.writeFileSync(path.join(dir, 'readme.txt'), 'info', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'permissions',
            dir,
            extension: '.sh',
            mode: 0o755,
          },
        ],
      };

      executeLayout(layout, { homeDir: tmpHome });

      const stats = fs.statSync(path.join(dir, 'run.sh'));
      expect(stats.mode & 0o111).not.toBe(0);

      // readme.txt should NOT be affected
      const txtStats = fs.statSync(path.join(dir, 'readme.txt'));
      expect(txtStats.mode & 0o111).toBe(0);
    });

    it('sets restrictive permission on .jsonl files', () => {
      if (process.platform === 'win32') return;

      const dir = targetPath('memory');
      fse.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, 'corrections.jsonl'), '{}', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'permissions',
            dir,
            extension: '.jsonl',
            mode: 0o600,
          },
        ],
      };

      executeLayout(layout, { homeDir: tmpHome });

      const stats = fs.statSync(path.join(dir, 'corrections.jsonl'));
      expect(stats.mode & 0o600).toBe(0o600);
    });

    it('does nothing in dry-run mode', () => {
      if (process.platform === 'win32') return;

      const dir = targetPath('hooks');
      fse.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, 'run.sh'), '#!/bin/bash', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'permissions',
            dir,
            extension: '.sh',
            mode: 0o755,
          },
        ],
      };

      executeLayout(layout, { homeDir: tmpHome, dryRun: true });

      // Permissions should NOT have been changed
      const stats = fs.statSync(path.join(dir, 'run.sh'));
      // Default file mode doesn't include execute bits
      expect(stats.mode & 0o111).toBe(0);
    });
  });

  // ─── merge-settings ─────────────────────────────────────────

  describe('merge-settings section', () => {
    it('copies template on fresh install with __HOME__ replacement', () => {
      const src = srcFile('settings.json', '{"hooks": {}, "home": "__HOME__"}');
      const dst = targetPath('settings.json');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'merge-settings',
            srcPath: src,
            dstPath: dst,
            replaceHome: true,
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: '/opt/home' });

      const content = fs.readFileSync(dst, 'utf-8');
      expect(content).toContain('/opt/home');
      expect(content).not.toContain('__HOME__');
      expect(summary.filesCreated).toBe(1);
    });

    it('deep-merges into existing valid JSON', () => {
      const src = srcFile(
        'settings.json',
        JSON.stringify({ hooks: { newEvent: [{ command: 'new.sh' }] } }),
      );
      const dst = targetPath('settings.json');
      fs.writeFileSync(
        dst,
        JSON.stringify({ hooks: { existingEvent: [{ command: 'old.sh' }] } }),
        'utf-8',
      );

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'merge-settings',
            srcPath: src,
            dstPath: dst,
            replaceHome: true,
          },
        ],
      };

      executeLayout(layout, { homeDir: tmpHome });

      const merged = JSON.parse(fs.readFileSync(dst, 'utf-8'));
      // Both events should be present
      expect(merged.hooks.existingEvent).toBeDefined();
      expect(merged.hooks.newEvent).toBeDefined();
    });
  });

  // ─── merge-agents ───────────────────────────────────────────

  describe('merge-agents section', () => {
    it('copies agent files when target does not exist', () => {
      const src = srcDir('agents', {
        'reviewer.md': '---\nname: reviewer\n---\nReviewer agent',
      });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'merge-agents',
            srcDir: src,
            dstDir: targetPath('agents'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(targetPath('agents', 'reviewer.md'))).toBe(true);
      expect(summary.agentsInstalled).toBe(1);
    });

    it('counts agents in dry-run mode', () => {
      const src = srcDir('agents', {
        'reviewer.md': '---\nname: reviewer\n---\nReviewer',
        'architect.md': '---\nname: architect\n---\nArchitect',
      });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'merge-agents',
            srcDir: src,
            dstDir: targetPath('agents'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome, dryRun: true });

      expect(summary.agentsInstalled).toBe(2);
      expect(fs.existsSync(targetPath('agents', 'reviewer.md'))).toBe(false);
    });
  });

  // ─── copy-skills ────────────────────────────────────────────

  describe('copy-skills section', () => {
    it('copies skill directories containing SKILL.md', () => {
      const skillDir = path.join(tmpHome, 'src', 'skills', 'debug');
      fse.ensureDirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Debug Skill', 'utf-8');
      const readmePath = path.join(tmpHome, 'src', 'skills', 'README.md');
      fs.writeFileSync(readmePath, '# Skills Index', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-skills',
            srcDir: path.join(tmpHome, 'src', 'skills'),
            dstDir: targetPath('skills'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(targetPath('skills', 'debug', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(targetPath('skills', 'README.md'))).toBe(true);
      expect(summary.filesCreated).toBe(2);
    });

    it('counts skills in dry-run mode without writing', () => {
      const skillDir = path.join(tmpHome, 'src', 'skills', 'test');
      fse.ensureDirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-skills',
            srcDir: path.join(tmpHome, 'src', 'skills'),
            dstDir: targetPath('skills'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome, dryRun: true });
      // Dry-run should count what would be created but not write files
      expect(fs.existsSync(targetPath('skills'))).toBe(false);
      expect(summary.filesCreated).toBe(1);
    });
  });

  // ─── multi-section integration ──────────────────────────────

  describe('multi-section layout', () => {
    it('executes sections in order and accumulates summary', () => {
      const src = srcDir('rules', { 'r1.md': 'rule 1' });
      const hookSrc = srcDir('hooks', { 'run.sh': '#!/bin/bash\necho __HOME__' });
      const settingsSrc = srcFile('settings.json', '{"hooks":{}}');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          { type: 'dirs', paths: ['rules', 'hooks'] },
          {
            type: 'copy-dir',
            srcDir: src,
            dstDir: targetPath('rules'),
            filter: '.md',
            strategy: 'always',
            counter: 'rulesInstalled',
          },
          {
            type: 'copy-dir',
            srcDir: hookSrc,
            dstDir: targetPath('hooks'),
            filter: '.sh',
            strategy: 'always',
            replaceHome: true,
            counter: 'hooksInstalled',
          },
          {
            type: 'merge-settings',
            srcPath: settingsSrc,
            dstPath: targetPath('settings.json'),
            replaceHome: true,
          },
          {
            type: 'permissions',
            dir: targetPath('hooks'),
            extension: '.sh',
            mode: 0o755,
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: '/custom/home' });

      // Files created
      expect(fs.existsSync(targetPath('rules', 'r1.md'))).toBe(true);
      expect(fs.existsSync(targetPath('hooks', 'run.sh'))).toBe(true);
      expect(fs.existsSync(targetPath('settings.json'))).toBe(true);

      // __HOME__ replaced
      const hookContent = fs.readFileSync(targetPath('hooks', 'run.sh'), 'utf-8');
      expect(hookContent).toContain('/custom/home');
      expect(hookContent).not.toContain('__HOME__');

      // Summary accumulated
      expect(summary.rulesInstalled).toBe(1);
      expect(summary.hooksInstalled).toBe(1);
      expect(summary.filesCreated).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── additional coverage ─────────────────────────────────────

  describe('copy section — dry-run', () => {
    it('does not write files in dry-run mode', () => {
      const src = srcFile('hello.txt', 'hello world');
      const dst = targetPath('hello.txt');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'copy', src, dst, strategy: 'always' }],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome, dryRun: true });

      expect(fs.existsSync(dst)).toBe(false);
      expect(summary.filesCreated).toBe(1); // counts what WOULD be created
    });
  });

  describe('copy-dir section — counter variations', () => {
    it('increments commandsInstalled counter', () => {
      const src = srcDir('commands', { 'boot.md': '# Boot', 'evolve.md': '# Evolve' });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-dir',
            srcDir: src,
            dstDir: targetPath('commands'),
            filter: '.md',
            strategy: 'always',
            counter: 'commandsInstalled',
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(summary.commandsInstalled).toBe(2);
      expect(summary.filesCreated).toBe(0); // counter redirects to commandsInstalled
    });

    it('defaults to filesCreated when no counter specified', () => {
      const src = srcDir('data', { 'file.txt': 'content' });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-dir',
            srcDir: src,
            dstDir: targetPath('data'),
            strategy: 'always',
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });
      expect(summary.filesCreated).toBe(1);
    });
  });

  describe('merge-settings — edge cases', () => {
    it('overwrites corrupt/invalid JSON target', () => {
      const src = srcFile('settings.json', '{"valid": true}');
      const dst = targetPath('settings.json');
      fs.writeFileSync(dst, 'not valid json{{{', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'merge-settings', srcPath: src, dstPath: dst }],
      };

      executeLayout(layout, { homeDir: tmpHome });

      const content = fs.readFileSync(dst, 'utf-8');
      expect(JSON.parse(content)).toEqual({ valid: true });
    });

    it('replaces __HOME__ on fresh install', () => {
      const src = srcFile('settings.json', '{"home": "__HOME__"}');
      const dst = targetPath('settings.json');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'merge-settings', srcPath: src, dstPath: dst, replaceHome: true }],
      };

      executeLayout(layout, { homeDir: '/opt/home' });

      const content = fs.readFileSync(dst, 'utf-8');
      expect(content).toContain('/opt/home');
      expect(content).not.toContain('__HOME__');
    });

    it('does not write in dry-run mode for fresh install', () => {
      const src = srcFile('settings.json', '{"hooks":{}}');
      const dst = targetPath('settings.json');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'merge-settings', srcPath: src, dstPath: dst }],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome, dryRun: true });

      expect(fs.existsSync(dst)).toBe(false);
      expect(summary.filesCreated).toBe(1);
    });
  });

  describe('seed-memory — specific files list', () => {
    it('only seeds files listed in the files array', () => {
      const src = srcDir('memory', {
        'README.md': '# Memory',
        'data.jsonl': '[]',
        'extra.txt': 'x',
      });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'seed-memory',
            srcDir: src,
            dstDir: targetPath('memory'),
            files: ['README.md'],
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      expect(fs.existsSync(targetPath('memory', 'README.md'))).toBe(true);
      expect(fs.existsSync(targetPath('memory', 'data.jsonl'))).toBe(false);
      expect(fs.existsSync(targetPath('memory', 'extra.txt'))).toBe(false);
      expect(summary.filesCreated).toBe(1);
    });

    it('does not write in dry-run mode', () => {
      const src = srcDir('memory', { 'README.md': '# Memory' });

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'seed-memory',
            srcDir: src,
            dstDir: targetPath('memory'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome, dryRun: true });

      expect(fs.existsSync(targetPath('memory', 'README.md'))).toBe(false);
      expect(summary.filesCreated).toBe(1); // still counts what would be created
    });
  });

  describe('copy-skills — edge cases', () => {
    it('skips directories without SKILL.md', () => {
      const skillDir = path.join(tmpHome, 'src', 'skills', 'noskill');
      fse.ensureDirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'README.md'), '# Not a skill', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [
          {
            type: 'copy-skills',
            srcDir: path.join(tmpHome, 'src', 'skills'),
            dstDir: targetPath('skills'),
          },
        ],
      };

      const summary = executeLayout(layout, { homeDir: tmpHome });

      // No SKILL.md = not a skill directory
      expect(fs.existsSync(targetPath('skills', 'noskill'))).toBe(false);
      expect(summary.filesCreated).toBe(0);
    });
  });

  describe('copy section — always overwrite', () => {
    it('always strategy overwrites existing file', () => {
      const src = srcFile('config.json', '{"version": 2}');
      const dst = targetPath('config.json');
      fs.writeFileSync(dst, '{"version": 1}', 'utf-8');

      const layout: AdapterLayout = {
        targetDir: path.join(tmpHome, 'target'),
        sections: [{ type: 'copy', src, dst, strategy: 'always' }],
      };

      executeLayout(layout, { homeDir: tmpHome });

      const content = fs.readFileSync(dst, 'utf-8');
      expect(JSON.parse(content)).toEqual({ version: 2 });
    });
  });
});
