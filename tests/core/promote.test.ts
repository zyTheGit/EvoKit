import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  analyzeCorrections,
  promotePatterns,
  generateVerifyLine,
  logDecisions,
} from '../../src/core/promote.js';
import { buildConfig } from '../../src/core/config.js';
import { appendToJsonl, readLearnedRules, getMemoryDir } from '../../src/core/memory.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-pr-'));
}

describe('promote', () => {
  describe('generateVerifyLine', () => {
    it('generates tool-based verify for known tools', () => {
      const line = generateVerifyLine('Always use uv instead of pip');
      expect(line).toContain('uv');
    });

    it('falls back to echo for generic patterns', () => {
      const line = generateVerifyLine('Be nice to the AI');
      expect(line).toContain('echo');
    });
  });

  describe('analyzeCorrections', () => {
    it('returns empty for no corrections', () => {
      const dir = tmpDir();
      const memDir = path.join(dir, '.claude', 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      const config = buildConfig({ homeDir: dir, dryRun: true });
      const groups = analyzeCorrections(config);
      expect(groups).toHaveLength(0);
    });

    it('groups patterns by count', () => {
      const dir = tmpDir();
      const memDir = getMemoryDir(dir);
      fs.mkdirSync(memDir, { recursive: true });
      const fp = path.join(memDir, 'corrections.jsonl');

      appendToJsonl(fp, {
        timestamp: new Date().toISOString(),
        pattern: 'use-uv',
        context: 'test',
        count: 1,
      });
      appendToJsonl(fp, {
        timestamp: new Date().toISOString(),
        pattern: 'use-uv',
        context: 'test',
        count: 1,
      });
      appendToJsonl(fp, {
        timestamp: new Date().toISOString(),
        pattern: 'other',
        context: 'test',
        count: 1,
      });

      const config = buildConfig({ homeDir: dir, dryRun: true });
      const groups = analyzeCorrections(config);
      expect(groups).toHaveLength(2);
      const uvGroup = groups.find((g) => g.pattern === 'use-uv');
      expect(uvGroup).toBeDefined();
      expect(uvGroup!.count).toBe(2);
    });
  });

  describe('promotePatterns', () => {
    it('promotes patterns meeting threshold', () => {
      const dir = tmpDir();
      const memDir = getMemoryDir(dir);
      fs.mkdirSync(memDir, { recursive: true });

      const config = buildConfig({ homeDir: dir, promoteThreshold: 2, dryRun: false });

      const groups = [
        { pattern: 'use-uv-over-pip', entries: [], count: 2 },
        { pattern: 'single-occurrence', entries: [], count: 1 },
      ];

      const results = promotePatterns(config, groups);

      const promoted = results.find((r) => r.decision === 'promoted');
      expect(promoted).toBeDefined();
      expect(promoted!.pattern).toBe('use-uv-over-pip');

      const deferred = results.find((r) => r.decision === 'deferred');
      expect(deferred).toBeDefined();
      expect(deferred!.pattern).toBe('single-occurrence');

      // Check that new rule was written
      const rules = readLearnedRules(path.join(memDir, 'learned-rules.md'));
      expect(rules.some((r) => r.description === 'use-uv-over-pip')).toBe(true);
    });

    it('rejects patterns already in learned-rules.md', () => {
      const dir = tmpDir();
      const memDir = getMemoryDir(dir);
      fs.mkdirSync(memDir, { recursive: true });

      // Seed an existing rule
      const rulesPath = path.join(memDir, 'learned-rules.md');
      fs.writeFileSync(rulesPath, '# Learned Rules\n\n- **existing-rule**\n\n', 'utf-8');

      const config = buildConfig({ homeDir: dir, promoteThreshold: 1, dryRun: false });

      const groups = [{ pattern: 'existing-rule', entries: [], count: 3 }];
      const results = promotePatterns(config, groups);

      const rejected = results.find((r) => r.decision === 'rejected');
      expect(rejected).toBeDefined();
      expect(rejected!.reason).toContain('已存在于 learned-rules.md 中');
    });

    it('respects dry-run', () => {
      const dir = tmpDir();
      const memDir = getMemoryDir(dir);
      fs.mkdirSync(memDir, { recursive: true });

      const config = buildConfig({ homeDir: dir, promoteThreshold: 1, dryRun: true });
      const groups = [{ pattern: 'dry-run-test', entries: [], count: 1 }];
      const results = promotePatterns(config, groups);

      const promoted = results.find((r) => r.decision === 'promoted');
      expect(promoted).toBeDefined();

      // File should NOT have been modified
      const rulesPath = path.join(memDir, 'learned-rules.md');
      expect(fs.existsSync(rulesPath)).toBe(false);
    });
  });

  describe('logDecisions', () => {
    it('writes to evolution-log.md', () => {
      const dir = tmpDir();
      const memDir = getMemoryDir(dir);
      fs.mkdirSync(memDir, { recursive: true });

      const config = buildConfig({ homeDir: dir, dryRun: false });
      logDecisions(config, [
        { pattern: 'test-pattern', decision: 'promoted', count: 2, reason: 'test' },
      ]);

      const logPath = path.join(memDir, 'evolution-log.md');
      const content = fs.readFileSync(logPath, 'utf-8');
      expect(content).toContain('test-pattern');
      expect(content).toContain('promoted');
    });
  });
});
