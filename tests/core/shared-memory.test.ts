import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  appendCorrection,
  appendObservation,
  recordSession,
  appendViolation,
  readCorrections,
  readObservations,
  readSessions,
  readLearnedRules,
  readViolations,
} from '../../src/core/shared-memory.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-shared-'));
}

describe('shared-memory', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = tmpDir();
  });

  describe('write and read corrections', () => {
    it('writes and reads back corrections', () => {
      appendCorrection(homeDir, { pattern: 'use-uv', context: 'Use uv instead of pip' });

      const corrections = readCorrections(homeDir);
      expect(corrections).toHaveLength(1);
      expect(corrections[0].pattern).toBe('use-uv');
      expect(corrections[0].count).toBe(1);
      expect(corrections[0].timestamp).toBeDefined();
    });

    it('appends to existing corrections file', () => {
      appendCorrection(homeDir, { pattern: 'rule-1', context: 'Context 1' });
      appendCorrection(homeDir, { pattern: 'rule-2', context: 'Context 2' });

      const corrections = readCorrections(homeDir);
      expect(corrections).toHaveLength(2);
    });

    it('returns empty array when no file exists', () => {
      const corrections = readCorrections(homeDir);
      expect(corrections).toHaveLength(0);
    });
  });

  describe('write and read observations', () => {
    it('writes and reads back observations', () => {
      appendObservation(homeDir, { pattern: 'camel-case', confidence: 0.8, source: 'self' });

      const observations = readObservations(homeDir);
      expect(observations).toHaveLength(1);
      expect(observations[0].pattern).toBe('camel-case');
      expect(observations[0].confidence).toBe(0.8);
    });
  });

  describe('session recording and filtering', () => {
    it('records and reads sessions with assistant tag', () => {
      recordSession(homeDir, {
        assistant: 'codex',
        duration_seconds: 120,
        corrections: 1,
        observations: 0,
        score: 'A',
      });

      recordSession(homeDir, {
        assistant: 'claude',
        duration_seconds: 300,
        corrections: 2,
        observations: 1,
        score: 'B',
      });

      const all = readSessions(homeDir);
      expect(all).toHaveLength(2);

      const codexSessions = readSessions(homeDir, { assistant: 'codex' });
      expect(codexSessions).toHaveLength(1);
      expect(codexSessions[0].assistant).toBe('codex');

      const claudeSessions = readSessions(homeDir, { assistant: 'claude' });
      expect(claudeSessions).toHaveLength(1);
    });
  });

  describe('violations', () => {
    it('writes and reads violations', () => {
      appendViolation(homeDir, {
        rule: 'no-console-log',
        file: 'src/index.ts',
        detail: 'console.log found',
      });

      const violations = readViolations(homeDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('no-console-log');
    });
  });

  describe('learned rules', () => {
    it('returns empty array when no file exists', () => {
      const rules = readLearnedRules(homeDir);
      expect(rules).toHaveLength(0);
    });
  });
});
