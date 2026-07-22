import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import { removeClaudeMdSection } from '../../src/core/remove-claude-md.js';

let tmpDir: string;

describe('remove-claude-md', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-rcm-'));
  });

  afterEach(() => {
    fse.removeSync(tmpDir);
  });

  // ─── File deletion (EvoKit created entire file) ──────────────

  describe('file deletion', () => {
    it('deletes entire file when EvoKit created it (marker at line 1, no user content before)', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content = '# Self-Evolving System Protocol\n\nSome protocol content\nMore lines';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('file-deleted');
      expect(fs.existsSync(claudeMdPath)).toBe(false);
    });

    it('deletes file when only --- separators and whitespace before marker', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content = '---\n\n---\n\nSelf-Evolving System Protocol\nContent';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('file-deleted');
      expect(fs.existsSync(claudeMdPath)).toBe(false);
    });
  });

  // ─── Section removal (EvoKit appended) ───────────────────────

  describe('section removal', () => {
    it('removes appended section from marker to EOF', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content =
        '# My Project\n\nSome user content\n\n---\n\nSelf-Evolving System Protocol\n\nProtocol body';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('section-removed');

      const updated = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(updated).toContain('# My Project');
      expect(updated).toContain('Some user content');
      expect(updated).not.toContain('Self-Evolving System Protocol');
      expect(updated).not.toContain('Protocol body');
    });

    it('preserves pre-existing content before the marker', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content =
        '# User Header\n\nUser instructions here\n\n---\n\nSelf-Evolving System Protocol v1.0\n\nEvolution content';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('section-removed');

      const updated = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(updated).toBe('# User Header\n\nUser instructions here\n');
    });

    it('cleans up --- separator before the marker', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content = '# User Content\n\n---\n\nSelf-Evolving System Protocol\nBody';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('section-removed');

      const updated = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(updated).not.toContain('---');
      expect(updated).toContain('# User Content');
    });
  });

  // ─── Skip conditions ─────────────────────────────────────────

  describe('skip conditions', () => {
    it('skips when marker not found', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content = '# My Project\n\nJust user content, no EvoKit marker';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('skipped');

      // File should be unchanged
      const unchanged = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(unchanged).toBe(content);
    });

    it('handles file that does not exist', () => {
      const claudeMdPath = path.join(tmpDir, 'nonexistent.md');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('skipped');
    });
  });

  // ─── Empty file after cleanup ────────────────────────────────

  describe('empty file after cleanup', () => {
    it('deletes file if after cleanup it is empty', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      // Content before marker is only --- and whitespace
      const content = '---\n\n---\n\nSelf-Evolving System Protocol\nBody';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol');

      expect(result.action).toBe('file-deleted');
      expect(fs.existsSync(claudeMdPath)).toBe(false);
    });
  });

  // ─── Dry-run mode ────────────────────────────────────────────

  describe('dry-run mode', () => {
    it('makes no changes in dry-run mode', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content = '# Self-Evolving System Protocol\n\nProtocol body';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol', true);

      // Would delete, but file should still exist
      expect(result.action).toBe('file-deleted');
      expect(fs.existsSync(claudeMdPath)).toBe(true);
    });

    it('dry-run reports section-removed without modifying file', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content = '# User Content\n\n---\n\nSelf-Evolving System Protocol\nBody';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol', true);

      expect(result.action).toBe('section-removed');

      // File should be unchanged
      const unchanged = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(unchanged).toBe(content);
    });
  });

  // ─── Custom marker ───────────────────────────────────────────

  describe('custom marker', () => {
    it('works with a custom append marker', () => {
      const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
      const content = '# User Content\n\n---\n\nCustom EvoKit Marker\nBody';
      fs.writeFileSync(claudeMdPath, content, 'utf-8');

      const result = removeClaudeMdSection(claudeMdPath, 'Custom EvoKit Marker');

      expect(result.action).toBe('section-removed');

      const updated = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(updated).toContain('# User Content');
      expect(updated).not.toContain('Custom EvoKit Marker');
    });
  });
});
