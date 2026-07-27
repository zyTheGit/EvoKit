/**
 * evokit update 命令 + upgrade profile 测试
 *
 * 测试策略：
 * - upgrade profile 行为通过 installPipeline 直接测试（命令行无关）
 * - update 命令注册和选项通过 Commander API 验证
 * - 整体端到端流程因 @clack/prompts 交互特性不在此处测试
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { installPipeline } from '../../src/core/template.js';
import { updateCommand } from '../../src/commands/update.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-upd-'));
}

describe('update command', () => {
  // ─── 命令注册 ───────────────────────────────────────────

  it('注册为 update 子命令', () => {
    expect(updateCommand.name()).toBe('update');
    expect(updateCommand.description()).toContain('更新');
  });

  it('支持所有必需选项', () => {
    const opts = updateCommand.options.map((o) => o.name());
    expect(opts).toContain('adapter');
    expect(opts).toContain('dry-run');
    expect(opts).toContain('force');
    expect(opts).toContain('verify');
    expect(opts).toContain('template');
    expect(opts).toContain('branch');
    expect(opts).toContain('home');
    expect(opts).toContain('project-dir');
  });

  it('注册了位置参数 adapter', () => {
    // 通过定义检查是否有位置参数（Commander args 在未解析前为空数组）
    const helpInfo = updateCommand.helpInformation();
    expect(helpInfo).toContain('[adapter]');
  });
});

describe('upgrade profile behavior', () => {
  const templateDir = path.resolve('template');

  // ─── CLAUDE.md 保留 ─────────────────────────────────────

  it('upgrade 保留用户修改的 CLAUDE.md', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    // full 安装
    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    // 用户修改 CLAUDE.md
    const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '用户自定义内容', 'utf-8');

    // upgrade 不应覆盖
    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'upgrade' });
    expect(fs.readFileSync(claudeMdPath, 'utf-8')).toBe('用户自定义内容');
  });

  // ─── MEMORY.md 保留 ─────────────────────────────────────

  it('upgrade 保留用户修改的 MEMORY.md', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    // 用户修改 MEMORY.md
    const memoryMdPath = path.join(claudeDir, 'MEMORY.md');
    fs.writeFileSync(memoryMdPath, '用户记忆数据', 'utf-8');

    // upgrade 不应覆盖
    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'upgrade' });
    expect(fs.readFileSync(memoryMdPath, 'utf-8')).toBe('用户记忆数据');
  });

  // ─── hooks 始终覆盖 ────────────────────────────────────

  it('upgrade 覆盖 hooks', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    const summary = installPipeline({
      homeDir,
      templateDir,
      targetDir: claudeDir,
      profile: 'upgrade',
    });

    expect(summary.hooksInstalled).toBeGreaterThan(0);
  });

  // ─── rules 始终覆盖 ────────────────────────────────────

  it('upgrade 覆盖 rules', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    const summary = installPipeline({
      homeDir,
      templateDir,
      targetDir: claudeDir,
      profile: 'upgrade',
    });

    expect(summary.rulesInstalled).toBeGreaterThan(0);
  });

  // ─── commands 始终覆盖 ─────────────────────────────────

  it('upgrade 覆盖 commands', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    const summary = installPipeline({
      homeDir,
      templateDir,
      targetDir: claudeDir,
      profile: 'upgrade',
    });

    expect(summary.commandsInstalled).toBeGreaterThan(0);
  });

  // ─── agents 覆盖 body ──────────────────────────────────

  it('upgrade 覆盖 agents body 同时保留用户 frontmatter', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    // 用户在 agent body 中添加自定义内容
    const agentPath = path.join(claudeDir, 'agents', 'architect.md');
    const originalContent = fs.readFileSync(agentPath, 'utf-8');

    // 在 body 中添加自定义标记
    const customContent = originalContent.replace(
      '## Design Process',
      '## Custom User Section\n\nThis is user-added content.\n\n## Design Process',
    );
    // 在 frontmatter 中添加用户自定义字段
    const withFrontmatter = customContent.replace(
      'description:',
      'model: opus\nuser-field: custom-value\ndescription:',
    );
    fs.writeFileSync(agentPath, withFrontmatter, 'utf-8');

    // upgrade
    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'upgrade' });

    const updatedContent = fs.readFileSync(agentPath, 'utf-8');

    // 用户 frontmatter 字段应保留
    expect(updatedContent).toContain('user-field: custom-value');
    expect(updatedContent).toContain('model: opus');

    // body 应被模板覆盖（Custom User Section 不应保留）
    expect(updatedContent).not.toContain('Custom User Section');
  });

  // ─── skills 始终覆盖 ───────────────────────────────────

  it('upgrade 覆盖 skills', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    const summary = installPipeline({
      homeDir,
      templateDir,
      targetDir: claudeDir,
      profile: 'upgrade',
    });

    expect(summary.skillsInstalled).toBeGreaterThan(0);
  });

  // ─── seed-memory 保留 ──────────────────────────────────

  it('upgrade 保留已存在的 memory 种子文件', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    // 用户修改 memory 种子文件
    const memFile = path.join(claudeDir, 'memory', 'README.md');
    fs.writeFileSync(memFile, '用户记忆数据', 'utf-8');

    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'upgrade' });
    expect(fs.readFileSync(memFile, 'utf-8')).toBe('用户记忆数据');
  });

  // ─── upgrade 幂等性 ────────────────────────────────────

  it('upgrade 是幂等的（连续运行不报错）', () => {
    const homeDir = tmpDir();
    const claudeDir = path.join(homeDir, '.claude');

    // 首次 full 安装
    installPipeline({ homeDir, templateDir, targetDir: claudeDir, profile: 'full' });

    // 连续两次 upgrade
    const s1 = installPipeline({
      homeDir,
      templateDir,
      targetDir: claudeDir,
      profile: 'upgrade',
    });
    const s2 = installPipeline({
      homeDir,
      templateDir,
      targetDir: claudeDir,
      profile: 'upgrade',
    });

    // 两次结果应一致（没有递增副作用）
    expect(s1.hooksInstalled).toBe(s2.hooksInstalled);
    expect(s1.rulesInstalled).toBe(s2.rulesInstalled);
    expect(s1.commandsInstalled).toBe(s2.commandsInstalled);
  });
});
