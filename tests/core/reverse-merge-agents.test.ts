import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import { reverseMergeAgents } from '../../src/core/reverse-merge-agents.js';
import type { ManifestAgentFrontmatter } from '../../src/core/manifest.js';

let tmpDir: string;

describe('reverse-merge-agents', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-rma-'));
  });

  afterEach(() => {
    fse.removeSync(tmpDir);
  });

  // ─── Frontmatter field removal ───────────────────────────────

  describe('field removal', () => {
    it('removes specific frontmatter fields from agent file', () => {
      const agentPath = path.join(tmpDir, 'reviewer.md');
      const content =
        '---\nname: reviewer\nmodel: sonnet\ntools: Read,Edit\n---\nReviewer agent body';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'reviewer.md', fields: { model: 'sonnet', tools: 'Read,Edit' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('reviewer.md');
      expect(result[0].action).toBe('cleaned');
      expect(result[0].fieldsRemoved).toBe(2);

      const updated = fs.readFileSync(agentPath, 'utf-8');
      expect(updated).toContain('name: reviewer');
      expect(updated).not.toContain('model: sonnet');
      expect(updated).not.toContain('tools: Read,Edit');
      expect(updated).toContain('Reviewer agent body');
    });

    it('preserves fields not in the manifest record', () => {
      const agentPath = path.join(tmpDir, 'architect.md');
      const content = '---\nname: architect\nmodel: sonnet\nuserField: custom\n---\nBody';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'architect.md', fields: { model: 'sonnet' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result[0].action).toBe('cleaned');
      expect(result[0].fieldsRemoved).toBe(1);

      const updated = fs.readFileSync(agentPath, 'utf-8');
      expect(updated).toContain('name: architect');
      expect(updated).toContain('userField: custom');
      expect(updated).not.toContain('model: sonnet');
    });
  });

  // ─── File deletion ───────────────────────────────────────────

  describe('file deletion', () => {
    it('deletes agent file when all frontmatter removed and body is empty', () => {
      const agentPath = path.join(tmpDir, 'empty.md');
      const content = '---\nmodel: sonnet\ntools: Read\n---\n';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'empty.md', fields: { model: 'sonnet', tools: 'Read' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result[0].action).toBe('deleted');
      expect(result[0].fieldsRemoved).toBe(2);
      expect(fs.existsSync(agentPath)).toBe(false);
    });

    it('deletes agent file when body is only whitespace', () => {
      const agentPath = path.join(tmpDir, 'whitespace.md');
      const content = '---\nmodel: sonnet\n---\n   \n  \n';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'whitespace.md', fields: { model: 'sonnet' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result[0].action).toBe('deleted');
      expect(fs.existsSync(agentPath)).toBe(false);
    });
  });

  // ─── Keep file with body content ─────────────────────────────

  describe('keep file with body', () => {
    it('keeps agent file when frontmatter has remaining user fields', () => {
      const agentPath = path.join(tmpDir, 'mixed.md');
      const content = '---\nname: myagent\nmodel: sonnet\n---\nMy agent body';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'mixed.md', fields: { model: 'sonnet' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result[0].action).toBe('cleaned');

      const updated = fs.readFileSync(agentPath, 'utf-8');
      expect(updated).toContain('name: myagent');
      expect(updated).toContain('My agent body');
    });

    it('keeps agent file when all frontmatter removed but body has content', () => {
      const agentPath = path.join(tmpDir, 'bodyonly.md');
      const content = '---\nmodel: sonnet\n---\nImportant user content here';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'bodyonly.md', fields: { model: 'sonnet' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result[0].action).toBe('cleaned');

      const updated = fs.readFileSync(agentPath, 'utf-8');
      expect(updated).not.toContain('---');
      expect(updated).toContain('Important user content here');
    });
  });

  // ─── Skip conditions ─────────────────────────────────────────

  describe('skip conditions', () => {
    it('skips when agent file does not exist', () => {
      const records: ManifestAgentFrontmatter[] = [
        { file: 'nonexistent.md', fields: { model: 'sonnet' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('skipped');
      expect(result[0].fieldsRemoved).toBe(0);
    });

    it('skips when file has no frontmatter', () => {
      const agentPath = path.join(tmpDir, 'nofm.md');
      fs.writeFileSync(agentPath, 'Just plain markdown content', 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'nofm.md', fields: { model: 'sonnet' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result[0].action).toBe('skipped');
      expect(result[0].fieldsRemoved).toBe(0);
    });

    it('skips when no matching fields found', () => {
      const agentPath = path.join(tmpDir, 'nomatch.md');
      const content = '---\nname: test\nmodel: opus\n---\nBody';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'nomatch.md', fields: { model: 'sonnet' } }, // value differs
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result[0].action).toBe('skipped');
      expect(result[0].fieldsRemoved).toBe(0);
    });
  });

  // ─── Dry-run mode ────────────────────────────────────────────

  describe('dry-run mode', () => {
    it('makes no changes in dry-run mode', () => {
      const agentPath = path.join(tmpDir, 'dryrun.md');
      // Body is empty so file would be deleted if not dry-run
      const content = '---\nmodel: sonnet\n---\n';
      fs.writeFileSync(agentPath, content, 'utf-8');

      const records: ManifestAgentFrontmatter[] = [
        { file: 'dryrun.md', fields: { model: 'sonnet' } },
      ];

      const result = reverseMergeAgents(tmpDir, records, true);

      // Reports what WOULD happen (deleted)
      expect(result[0].action).toBe('deleted');
      expect(result[0].fieldsRemoved).toBe(1);

      // But file should still exist (dry-run doesn't write)
      expect(fs.existsSync(agentPath)).toBe(true);
      const unchanged = fs.readFileSync(agentPath, 'utf-8');
      expect(unchanged).toBe(content);
    });
  });

  // ─── Multiple files ──────────────────────────────────────────

  describe('multiple files', () => {
    it('processes multiple agent files', () => {
      fs.writeFileSync(path.join(tmpDir, 'agent1.md'), '---\nmodel: sonnet\n---\nAgent 1', 'utf-8');
      fs.writeFileSync(
        path.join(tmpDir, 'agent2.md'),
        '---\nmodel: sonnet\ntools: Read\n---\nAgent 2',
        'utf-8',
      );

      const records: ManifestAgentFrontmatter[] = [
        { file: 'agent1.md', fields: { model: 'sonnet' } },
        { file: 'agent2.md', fields: { model: 'sonnet', tools: 'Read' } },
      ];

      const result = reverseMergeAgents(tmpDir, records);

      expect(result).toHaveLength(2);
      // agent1: all frontmatter removed, body remains → cleaned (body has content)
      expect(result[0].action).toBe('cleaned');
      // agent2: all frontmatter removed, body remains → cleaned
      expect(result[1].action).toBe('cleaned');
    });
  });
});
