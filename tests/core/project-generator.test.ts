/**
 * project-generator 测试
 *
 * 验证项目级规范生成引擎的核心逻辑：
 * - 目录结构创建
 * - CLAUDE.md 生成（skip-if-exists）
 * - 规则文件生成（按开关控制）
 * - agents 和 commands 生成
 * - dry-run 模式
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fse from 'fs-extra';
import {
  generateProjectStructure,
  type ProjectGeneratorConfig,
  type ProjectInfo,
  type RuleToggles,
} from '../../src/core/project-generator.js';

/** 创建临时测试目录 */
async function createTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `evokit-project-test-${Date.now()}`);
  await fse.ensureDir(dir);
  return dir;
}

/** 默认项目信息 */
const defaultInfo: ProjectInfo = {
  name: 'test-project',
  description: '测试项目',
  language: 'TypeScript',
};

/** 默认规则开关（全部开启） */
const defaultToggles: RuleToggles = {
  commitConvention: true,
  testGate: true,
  docsSync: true,
};

describe('generateProjectStructure', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await fse.remove(tempDir);
  });

  it('应创建完整的 .claude/ 目录结构', async () => {
    const result = await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: defaultToggles,
      dryRun: false,
    });

    // 验证目录存在
    expect(await fse.pathExists(path.join(tempDir, '.claude'))).toBe(true);
    expect(await fse.pathExists(path.join(tempDir, '.claude', 'rules'))).toBe(true);
    expect(await fse.pathExists(path.join(tempDir, '.claude', 'agents'))).toBe(true);
    expect(await fse.pathExists(path.join(tempDir, '.claude', 'commands'))).toBe(true);
    expect(await fse.pathExists(path.join(tempDir, '.claude', 'memory'))).toBe(true);

    // 验证创建了文件
    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.filesSkipped).toBe(0);
  });

  it('应生成 CLAUDE.md 并包含项目信息', async () => {
    await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: defaultToggles,
      dryRun: false,
    });

    const claudeMdPath = path.join(tempDir, 'CLAUDE.md');
    expect(await fse.pathExists(claudeMdPath)).toBe(true);

    const content = await fse.readFile(claudeMdPath, 'utf-8');
    expect(content).toContain('test-project');
    expect(content).toContain('测试项目');
    expect(content).toContain('TypeScript');
  });

  it('应跳过已存在的 CLAUDE.md', async () => {
    // 预先创建 CLAUDE.md
    await fse.writeFile(path.join(tempDir, 'CLAUDE.md'), '# 已有内容', 'utf-8');

    const result = await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: defaultToggles,
      dryRun: false,
    });

    expect(result.claudeMdCreated).toBe(false);
    expect(result.filesSkipped).toBeGreaterThanOrEqual(1);

    // 验证内容未被覆盖
    const content = await fse.readFile(path.join(tempDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe('# 已有内容');
  });

  it('应根据开关生成规则文件', async () => {
    const result = await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: { commitConvention: true, testGate: false, docsSync: false },
      dryRun: false,
    });

    expect(result.rulesCreated).toEqual(['commit-convention.md']);
    expect(
      await fse.pathExists(path.join(tempDir, '.claude', 'rules', 'commit-convention.md')),
    ).toBe(true);
    expect(await fse.pathExists(path.join(tempDir, '.claude', 'rules', 'test-gate.md'))).toBe(
      false,
    );
    expect(await fse.pathExists(path.join(tempDir, '.claude', 'rules', 'docs-sync.md'))).toBe(
      false,
    );
  });

  it('应生成 agents 和 commands', async () => {
    const result = await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: defaultToggles,
      dryRun: false,
    });

    expect(result.agentsCreated).toContain('architect.md');
    expect(result.agentsCreated).toContain('reviewer.md');
    expect(result.commandsCreated).toContain('boot.md');
    expect(result.commandsCreated).toContain('review.md');

    // 验证文件内容包含 frontmatter
    const architectContent = await fse.readFile(
      path.join(tempDir, '.claude', 'agents', 'architect.md'),
      'utf-8',
    );
    expect(architectContent).toContain('name: architect');
  });

  it('应跳过已存在的规则文件', async () => {
    // 预先创建一个规则文件
    const rulesDir = path.join(tempDir, '.claude', 'rules');
    await fse.ensureDir(rulesDir);
    await fse.writeFile(path.join(rulesDir, 'commit-convention.md'), '已有规则', 'utf-8');

    const result = await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: defaultToggles,
      dryRun: false,
    });

    expect(result.rulesCreated).not.toContain('commit-convention.md');
    expect(result.filesSkipped).toBeGreaterThanOrEqual(1);

    // 验证内容未被覆盖
    const content = await fse.readFile(path.join(rulesDir, 'commit-convention.md'), 'utf-8');
    expect(content).toBe('已有规则');
  });

  it('dry-run 模式不应写入任何文件', async () => {
    const result = await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: defaultToggles,
      dryRun: true,
    });

    // dry-run 仍返回统计信息
    expect(result.filesCreated).toBeGreaterThan(0);

    // 但实际文件不应存在
    expect(await fse.pathExists(path.join(tempDir, 'CLAUDE.md'))).toBe(false);
    expect(await fse.pathExists(path.join(tempDir, '.claude'))).toBe(false);
  });

  it('应生成 MEMORY.md', async () => {
    await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: defaultToggles,
      dryRun: false,
    });

    const memoryMdPath = path.join(tempDir, '.claude', 'MEMORY.md');
    expect(await fse.pathExists(memoryMdPath)).toBe(true);

    const content = await fse.readFile(memoryMdPath, 'utf-8');
    expect(content).toContain('项目记忆索引');
  });

  it('全部规则关闭时不应生成任何规则文件', async () => {
    const result = await generateProjectStructure({
      targetDir: tempDir,
      projectInfo: defaultInfo,
      ruleToggles: { commitConvention: false, testGate: false, docsSync: false },
      dryRun: false,
    });

    expect(result.rulesCreated).toEqual([]);
    expect(
      await fse.pathExists(path.join(tempDir, '.claude', 'rules', 'commit-convention.md')),
    ).toBe(false);
  });
});
