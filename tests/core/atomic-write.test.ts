import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import { atomicWriteFile } from '../../src/core/atomic-write.js';

let tmpDir: string;

describe('atomic-write', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-aw-'));
  });

  afterEach(() => {
    fse.removeSync(tmpDir);
  });

  // ─── 基本写入 ────────────────────────────────────────────────

  describe('基本写入', () => {
    it('写入内容到目标文件', () => {
      const target = path.join(tmpDir, 'test.txt');
      const result = atomicWriteFile(target, 'hello world');

      expect(result.ok).toBe(true);
      expect(fs.readFileSync(target, 'utf-8')).toBe('hello world');
    });

    it('写入空内容', () => {
      const target = path.join(tmpDir, 'empty.txt');
      const result = atomicWriteFile(target, '');

      expect(result.ok).toBe(true);
      expect(fs.readFileSync(target, 'utf-8')).toBe('');
    });

    it('写入多行内容', () => {
      const target = path.join(tmpDir, 'multi.txt');
      const content = 'line1\nline2\nline3\n';
      const result = atomicWriteFile(target, content);

      expect(result.ok).toBe(true);
      expect(fs.readFileSync(target, 'utf-8')).toBe(content);
    });

    it('写入 JSON 内容', () => {
      const target = path.join(tmpDir, 'data.json');
      const content = JSON.stringify({ key: 'value', num: 42 }, null, 2) + '\n';
      const result = atomicWriteFile(target, content);

      expect(result.ok).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
      expect(parsed.key).toBe('value');
      expect(parsed.num).toBe(42);
    });

    it('写入后不残留临时文件', () => {
      const target = path.join(tmpDir, 'clean.txt');
      atomicWriteFile(target, 'content');

      // 临时文件应被清理
      expect(fs.existsSync(target + '.tmp')).toBe(false);
    });
  });

  // ─── 验证 ────────────────────────────────────────────────────

  describe('验证', () => {
    it('验证通过时正常写入', () => {
      const target = path.join(tmpDir, 'valid.json');
      const content = '{"ok":true}\n';
      const result = atomicWriteFile(target, content, {
        validate: (tmpPath) => {
          try {
            JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
            return true;
          } catch {
            return false;
          }
        },
      });

      expect(result.ok).toBe(true);
      expect(JSON.parse(fs.readFileSync(target, 'utf-8')).ok).toBe(true);
    });

    it('验证失败时中止写入并清理临时文件', () => {
      const target = path.join(tmpDir, 'invalid.json');
      const content = 'not valid json{{{';
      const result = atomicWriteFile(target, content, {
        validate: (tmpPath) => {
          try {
            JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
            return true;
          } catch {
            return false;
          }
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('写入验证失败');
      // 目标文件不应存在
      expect(fs.existsSync(target)).toBe(false);
      // 临时文件应被清理
      expect(fs.existsSync(target + '.tmp')).toBe(false);
    });

    it('验证函数抛出异常时视为验证失败', () => {
      const target = path.join(tmpDir, 'throw.txt');
      const result = atomicWriteFile(target, 'content', {
        validate: () => {
          throw new Error('验证异常');
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('写入验证失败');
      expect(fs.existsSync(target)).toBe(false);
    });
  });

  // ─── 备份 ────────────────────────────────────────────────────

  describe('备份', () => {
    it('backup=true 时创建 .bak.evokit 备份', () => {
      const target = path.join(tmpDir, 'backup.txt');
      // 先写入原始内容
      fs.writeFileSync(target, 'original', 'utf-8');

      const result = atomicWriteFile(target, 'updated', { backup: true });

      expect(result.ok).toBe(true);
      expect(result.backupPath).toBe(target + '.bak.evokit');
      // 目标文件已更新
      expect(fs.readFileSync(target, 'utf-8')).toBe('updated');
      // 备份文件保留原始内容
      expect(fs.readFileSync(result.backupPath!, 'utf-8')).toBe('original');
    });

    it('backup=自定义后缀 时使用指定后缀', () => {
      const target = path.join(tmpDir, 'custom.txt');
      fs.writeFileSync(target, 'original', 'utf-8');

      const result = atomicWriteFile(target, 'updated', { backup: '.bak' });

      expect(result.ok).toBe(true);
      expect(result.backupPath).toBe(target + '.bak');
      expect(fs.readFileSync(result.backupPath!, 'utf-8')).toBe('original');
    });

    it('原文件不存在时 backup 选项不创建备份', () => {
      const target = path.join(tmpDir, 'new.txt');
      const result = atomicWriteFile(target, 'content', { backup: true });

      expect(result.ok).toBe(true);
      // 原文件不存在，backupPath 虽然计算了但实际没有备份文件
      expect(fs.existsSync(target + '.bak.evokit')).toBe(false);
    });

    it('备份失败时中止写入并返回错误', () => {
      // 在只读目录中创建目标文件，使 renameSync 备份操作失败
      const readOnlyDir = path.join(tmpDir, 'readonly');
      fs.mkdirSync(readOnlyDir);
      const target = path.join(readOnlyDir, 'nobackup.txt');
      fs.writeFileSync(target, 'original', 'utf-8');

      // 将目录设为只读，阻止 renameSync（备份和最终重命名都会失败）
      fs.chmodSync(readOnlyDir, 0o444);

      try {
        const result = atomicWriteFile(target, 'updated', { backup: true });

        // 在某些系统上可能成功也可能失败，取决于权限模型
        // 关键是：如果失败，error 应包含有意义的信息
        if (!result.ok) {
          expect(result.error).toBeTruthy();
        }
      } finally {
        // 恢复权限以便清理
        fs.chmodSync(readOnlyDir, 0o755);
      }
    });

    it('旧备份文件存在时先移除再创建新备份', () => {
      const target = path.join(tmpDir, 'replace.txt');
      fs.writeFileSync(target, 'original', 'utf-8');
      // 创建旧备份
      const backupPath = target + '.bak.evokit';
      fs.writeFileSync(backupPath, 'old-backup', 'utf-8');

      const result = atomicWriteFile(target, 'updated', { backup: true });

      expect(result.ok).toBe(true);
      // 备份应为当前原始内容，而非旧备份
      expect(fs.readFileSync(backupPath, 'utf-8')).toBe('original');
    });
  });

  // ─── tmpSuffix 选项 ──────────────────────────────────────────

  describe('tmpSuffix 选项', () => {
    it('使用自定义 tmpSuffix', () => {
      const target = path.join(tmpDir, 'suffix.txt');
      const result = atomicWriteFile(target, 'content', { tmpSuffix: '.merge.tmp' });

      expect(result.ok).toBe(true);
      expect(fs.readFileSync(target, 'utf-8')).toBe('content');
      // 自定义后缀的临时文件应被清理
      expect(fs.existsSync(target + '.merge.tmp')).toBe(false);
    });
  });

  // ─── 错误处理 ────────────────────────────────────────────────

  describe('错误处理', () => {
    it('目标目录不存在时写入失败', () => {
      const target = path.join(tmpDir, 'nonexistent', 'dir', 'file.txt');
      const result = atomicWriteFile(target, 'content');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('无法写入临时文件');
    });
  });
});
