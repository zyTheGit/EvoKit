import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { rotateJsonlFile, applyConfidenceDecay } from '../../src/core/rotate.js';
import { buildConfig } from '../../src/core/config.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-rotate-'));
}

describe('rotate', () => {
  describe('rotateJsonlFile', () => {
    it('does nothing when file is under max lines', () => {
      const dir = tmpDir();
      const memDir = path.join(dir, '.claude', 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      const fp = path.join(memDir, 'test.jsonl');
      for (let i = 0; i < 3; i++) {
        fs.appendFileSync(fp, JSON.stringify({ timestamp: new Date().toISOString(), i }) + '\n');
      }
      const config = buildConfig({ homeDir: dir, maxLines: 10, dryRun: false });
      const result = rotateJsonlFile(config, 'test.jsonl');
      expect(result.archived).toBe(0);
      expect(result.kept).toBe(3);
    });

    it('archives old entries when over max lines', () => {
      const dir = tmpDir();
      const memDir = path.join(dir, '.claude', 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      const fp = path.join(memDir, 'test.jsonl');

      // Recent entries
      for (let i = 0; i < 3; i++) {
        fs.appendFileSync(fp, JSON.stringify({ timestamp: new Date().toISOString(), i }) + '\n');
      }
      // Old entries
      const oldDate = new Date(0).toISOString();
      for (let i = 0; i < 5; i++) {
        fs.appendFileSync(fp, JSON.stringify({ timestamp: oldDate, i: i + 10 }) + '\n');
      }

      const config = buildConfig({ homeDir: dir, maxLines: 5, maxDays: 1, dryRun: false });
      const result = rotateJsonlFile(config, 'test.jsonl');
      expect(result.kept).toBe(3);
      expect(result.archived).toBe(5);
    });

    it('respects dry-run mode', () => {
      const dir = tmpDir();
      const memDir = path.join(dir, '.claude', 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      const fp = path.join(memDir, 'test.jsonl');
      const oldDate = new Date(0).toISOString();
      for (let i = 0; i < 10; i++) {
        fs.appendFileSync(fp, JSON.stringify({ timestamp: oldDate, i }) + '\n');
      }
      const config = buildConfig({ homeDir: dir, maxLines: 3, maxDays: 1, dryRun: true });
      const result = rotateJsonlFile(config, 'test.jsonl');
      expect(result.archived).toBe(10);
      // File should still have all entries (dry run)
      const remaining = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
      expect(remaining).toHaveLength(10);
    });

    it('handles missing file gracefully', () => {
      const dir = tmpDir();
      const config = buildConfig({ homeDir: dir, dryRun: false });
      const result = rotateJsonlFile(config, 'nonexistent.jsonl');
      expect(result.kept).toBe(0);
      expect(result.archived).toBe(0);
    });
  });

  describe('applyConfidenceDecay', () => {
    it('does nothing when no entries need decay', () => {
      const dir = tmpDir();
      const memDir = path.join(dir, '.claude', 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      const fp = path.join(memDir, 'obs.jsonl');
      fs.appendFileSync(
        fp,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          pattern: 'test',
          confidence: 0.8,
          source: 'test',
        }) + '\n',
      );
      const config = buildConfig({
        homeDir: dir,
        confidenceDecayDays: 60,
        confidenceThreshold: 0.3,
        dryRun: false,
      });
      const result = applyConfidenceDecay(config, 'obs.jsonl');
      expect(result.kept).toBe(1);
      expect(result.archived).toBe(0);
    });

    it('archives entries below threshold after decay', () => {
      const dir = tmpDir();
      const memDir = path.join(dir, '.claude', 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      const fp = path.join(memDir, 'obs.jsonl');
      const oldDate = new Date(0).toISOString();
      fs.appendFileSync(
        fp,
        JSON.stringify({
          timestamp: oldDate,
          pattern: 'old-pattern',
          confidence: 0.4, // will be 0.2 after decay < 0.3 threshold
          source: 'test',
        }) + '\n',
      );
      const config = buildConfig({
        homeDir: dir,
        confidenceDecayDays: 1,
        confidenceThreshold: 0.3,
        dryRun: false,
      });
      const result = applyConfidenceDecay(config, 'obs.jsonl');
      expect(result.kept).toBe(0);
      expect(result.archived).toBe(1);
    });

    it('handles missing file', () => {
      const dir = tmpDir();
      const config = buildConfig({ homeDir: dir, dryRun: false });
      const result = applyConfidenceDecay(config, 'nonexistent.jsonl');
      expect(result.kept).toBe(0);
      expect(result.archived).toBe(0);
    });
  });
});
