import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  readJsonlFile,
  appendToJsonl,
  writeJsonlFile,
  appendToEvolutionLog,
  getFileLineCount,
  getClaudeDir,
  getMemoryDir,
  getPersonalKnowledgeRoot,
  getProjectKnowledgeRoot,
  getKnowledgeRootParts,
  isOlderThanDays,
} from '../../src/core/memory.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-test-'));
}

describe('memory', () => {
  describe('readJsonlFile', () => {
    it('returns empty array for missing file', () => {
      const result = readJsonlFile('/nonexistent/file.jsonl');
      expect(result).toEqual([]);
    });

    it('reads valid JSONL entries', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'test.jsonl');
      fs.writeFileSync(fp, '{"a":1}\n{"a":2}\n', 'utf-8');
      const result = readJsonlFile<{ a: number }>(fp);
      expect(result).toHaveLength(2);
      expect(result[0].a).toBe(1);
      expect(result[1].a).toBe(2);
    });

    it('skips empty lines', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'empty.jsonl');
      fs.writeFileSync(fp, '{"a":1}\n\n{"a":2}\n', 'utf-8');
      const result = readJsonlFile<{ a: number }>(fp);
      expect(result).toHaveLength(2);
    });

    it('skips malformed entries with warning', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'bad.jsonl');
      fs.writeFileSync(fp, '{"a":1}\nnot-json\n{"a":2}\n', 'utf-8');
      const result = readJsonlFile<{ a: number }>(fp);
      expect(result).toHaveLength(2);
    });
  });

  describe('appendToJsonl', () => {
    it('creates file and appends entry', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'append.jsonl');
      appendToJsonl(fp, { hello: 'world' });
      const content = fs.readFileSync(fp, 'utf-8').trim();
      expect(JSON.parse(content)).toEqual({ hello: 'world' });
    });

    it('appends to existing file', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'append2.jsonl');
      fs.writeFileSync(fp, '{"a":1}\n', 'utf-8');
      appendToJsonl(fp, { b: 2 });
      const entries = readJsonlFile(fp);
      expect(entries).toHaveLength(2);
    });
  });

  describe('writeJsonlFile', () => {
    it('writes entries to file', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'write.jsonl');
      writeJsonlFile(fp, [{ x: 1 }, { x: 2 }]);
      const content = fs.readFileSync(fp, 'utf-8');
      expect(content.trim().split('\n')).toHaveLength(2);
    });

    it('overwrites existing file', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'overwrite.jsonl');
      fs.writeFileSync(fp, '{"old": true}\n', 'utf-8');
      writeJsonlFile(fp, [{ fresh: true }]);
      const entries = readJsonlFile(fp);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({ fresh: true });
    });
  });

  describe('appendToEvolutionLog', () => {
    it('creates log file if missing and appends entry', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'log.md');
      appendToEvolutionLog(fp, 'Test entry');
      const content = fs.readFileSync(fp, 'utf-8');
      expect(content).toContain('Test entry');
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}/); // has timestamp
    });
  });

  describe('getFileLineCount', () => {
    it('returns 0 for missing file', () => {
      expect(getFileLineCount('/nonexistent')).toBe(0);
    });

    it('counts lines correctly', () => {
      const dir = tmpDir();
      const fp = path.join(dir, 'lines.txt');
      fs.writeFileSync(fp, 'a\nb\nc\n', 'utf-8');
      expect(getFileLineCount(fp)).toBe(3);
    });
  });

  describe('getClaudeDir / getMemoryDir', () => {
    it('returns correct paths', () => {
      expect(getClaudeDir('/home/user')).toBe('/home/user/.claude');
      expect(getMemoryDir('/home/user')).toBe('/home/user/.claude/memory');
    });
  });

  describe('共享知识根（canonical root, spec #36 / T1）', () => {
    it('个人知识根 = ~/.evokit/knowledge/（agent 无关）', () => {
      expect(getPersonalKnowledgeRoot('/home/user')).toBe('/home/user/.evokit/knowledge');
    });

    it('个人知识根不依赖任一 adapter 私有路径（4 助手共享同一根）', () => {
      // 不再是 per-adapter 的 ~/.claude ~/.codex ~/.config/opencode ~/.pi
      const home = '/home/user';
      const root = getPersonalKnowledgeRoot(home);
      for (const adapterPath of [
        '.claude/memory',
        '.codex/memory',
        '.config/opencode/memory',
        '.pi/agent/memory',
      ]) {
        expect(root).not.toMatch(adapterPath);
      }
      expect(root).toBe(path.join(home, '.evokit', 'knowledge'));
    });

    it('项目知识根 = <projectDir>/.evokit/（随 git 走）', () => {
      expect(getProjectKnowledgeRoot('/work/myproj')).toBe('/work/myproj/.evokit');
    });

    it('从规范根导出三个子路径（index / entries / .pending）', () => {
      const parts = getKnowledgeRootParts('/work/myproj/.evokit');
      expect(parts.index).toBe('/work/myproj/.evokit/knowledge-index.md');
      expect(parts.entries).toBe('/work/myproj/.evokit/knowledge');
      expect(parts.pending).toBe('/work/myproj/.evokit/.pending');
    });
  });

  describe('isOlderThanDays', () => {
    it('returns true for old timestamps', () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      expect(isOlderThanDays(oldDate, 30)).toBe(true);
    });

    it('returns false for recent timestamps', () => {
      const recent = new Date().toISOString();
      expect(isOlderThanDays(recent, 30)).toBe(false);
    });

    it('returns false for invalid timestamps', () => {
      expect(isOlderThanDays('invalid-date', 30)).toBe(false);
    });
  });
});
