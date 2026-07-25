import { describe, it, expect } from 'vitest';
import { ManifestCollector } from '../../src/core/manifest-collector.js';

describe('ManifestCollector', () => {
  // ─── recordFile ────────────────────────────────────────────

  describe('recordFile', () => {
    it('records files from recordFile()', () => {
      const collector = new ManifestCollector();
      collector.recordFile({
        path: '/home/user/.claude/CLAUDE.md',
        source: 'copy',
        mode: 'created',
      });
      collector.recordFile({
        path: '/home/user/.claude/MEMORY.md',
        source: 'copy',
        mode: 'appended',
        appendMarker: 'EvoKit Section',
      });

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('/home/user/.claude/CLAUDE.md');
      expect(result.files[0].mode).toBe('created');
      expect(result.files[1].mode).toBe('appended');
      expect(result.files[1].appendMarker).toBe('EvoKit Section');
    });
  });

  // ─── recordDirectory ───────────────────────────────────────

  describe('recordDirectory', () => {
    it('records directories', () => {
      const collector = new ManifestCollector();
      collector.recordDirectory('rules');
      collector.recordDirectory('agents');

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.directories).toEqual(['rules', 'agents']);
    });
  });

  // ─── recordHook ────────────────────────────────────────────

  describe('recordHook', () => {
    it('records hook entries', () => {
      const collector = new ManifestCollector();
      collector.recordHook('SessionStart', { matcher: '', hooks: [{ command: 'run.sh' }] });
      collector.recordHook('PreToolUse', { matcher: 'Edit', hooks: [{ command: 'check.sh' }] });

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.hooks).toHaveLength(2);
      expect(result.hooks[0].event).toBe('SessionStart');
      expect(result.hooks[1].event).toBe('PreToolUse');
      expect(result.hooks[0].entry).toEqual({ matcher: '', hooks: [{ command: 'run.sh' }] });
    });
  });

  // ─── recordEnvVar ──────────────────────────────────────────

  describe('recordEnvVar', () => {
    it('records env vars', () => {
      const collector = new ManifestCollector();
      collector.recordEnvVar('UV_MANAGED_PYTHON', '1');
      collector.recordEnvVar('DEBUG', 'true');

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.envVars).toHaveLength(2);
      expect(result.envVars[0]).toEqual({ key: 'UV_MANAGED_PYTHON', value: '1' });
      expect(result.envVars[1]).toEqual({ key: 'DEBUG', value: 'true' });
    });
  });

  // ─── recordAutoMemoryEnabled ───────────────────────────────

  describe('recordAutoMemoryEnabled', () => {
    it('records autoMemoryEnabled flag', () => {
      const collector = new ManifestCollector();

      const result1 = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });
      expect(result1.autoMemoryEnabledSet).toBe(false);

      collector.recordAutoMemoryEnabled();
      const result2 = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });
      expect(result2.autoMemoryEnabledSet).toBe(true);
    });
  });

  // ─── recordAgentFrontmatter ────────────────────────────────

  describe('recordAgentFrontmatter', () => {
    it('records agent frontmatter', () => {
      const collector = new ManifestCollector();
      collector.recordAgentFrontmatter('architect.md', { model: 'opus', tools: 'Read,Write' });
      collector.recordAgentFrontmatter('reviewer.md', { model: 'sonnet' });

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.agentFrontmatter).toHaveLength(2);
      expect(result.agentFrontmatter[0].file).toBe('architect.md');
      expect(result.agentFrontmatter[0].fields).toEqual({ model: 'opus', tools: 'Read,Write' });
      expect(result.agentFrontmatter[1].file).toBe('reviewer.md');
    });
  });

  // ─── recordMemorySeed ──────────────────────────────────────

  describe('recordMemorySeed', () => {
    it('records memory seeds', () => {
      const collector = new ManifestCollector();
      collector.recordMemorySeed('corrections.jsonl');
      collector.recordMemorySeed('observations.jsonl');

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.memorySeeds).toEqual(['corrections.jsonl', 'observations.jsonl']);
    });
  });

  // ─── recordPermissionAllow ─────────────────────────────────

  describe('recordPermissionAllow', () => {
    it('records permission allow rules', () => {
      const collector = new ManifestCollector();
      collector.recordPermissionAllow('Bash(bash .claude/hooks/*.sh)');
      collector.recordPermissionAllow('Read');

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.permissionsAllow).toEqual(['Bash(bash .claude/hooks/*.sh)', 'Read']);
    });

    it('defaults to empty array when no rules recorded', () => {
      const collector = new ManifestCollector();

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.permissionsAllow).toEqual([]);
    });
  });

  // ─── recordSkillDir ────────────────────────────────────────

  describe('recordSkillDir', () => {
    it('records skill dirs', () => {
      const collector = new ManifestCollector();
      collector.recordSkillDir('debug');
      collector.recordSkillDir('review');

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.skillDirs).toEqual(['debug', 'review']);
    });
  });

  // ─── build ─────────────────────────────────────────────────

  describe('build', () => {
    it('produces correct AdapterManifest with all fields', () => {
      const collector = new ManifestCollector();
      collector.recordFile({ path: '/a', source: 'copy', mode: 'created' });
      collector.recordDirectory('rules');
      collector.recordHook('SessionStart', { hooks: [] });
      collector.recordEnvVar('KEY', 'val');
      collector.recordAutoMemoryEnabled();
      collector.recordAgentFrontmatter('architect.md', { model: 'opus' });
      collector.recordMemorySeed('corrections.jsonl');
      collector.recordSkillDir('debug');
      collector.recordPermissionAllow('Bash(bash .claude/hooks/*.sh)');

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '2.0.0',
        homeDir: '/home/user',
        projectDir: '/home/user/project',
        adapterHome: '/home/user/.claude',
      });

      expect(result.adapterId).toBe('claude');
      expect(result.adapterVersion).toBe('2.0.0');
      expect(result.homeDir).toBe('/home/user');
      expect(result.projectDir).toBe('/home/user/project');
      expect(result.adapterHome).toBe('/home/user/.claude');
      expect(result.files).toHaveLength(1);
      expect(result.directories).toEqual(['rules']);
      expect(result.hooks).toHaveLength(1);
      expect(result.envVars).toHaveLength(1);
      expect(result.autoMemoryEnabledSet).toBe(true);
      expect(result.agentFrontmatter).toHaveLength(1);
      expect(result.memorySeeds).toEqual(['corrections.jsonl']);
      expect(result.skillDirs).toEqual(['debug']);
      expect(result.permissionsAllow).toEqual(['Bash(bash .claude/hooks/*.sh)']);
    });

    it('sets installedAt to a valid ISO timestamp', () => {
      const collector = new ManifestCollector();
      const before = new Date();

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      const after = new Date();
      const installedAt = new Date(result.installedAt);
      expect(installedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(installedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      // Verify it's a valid ISO string
      expect(result.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('produces empty arrays when no records are added', () => {
      const collector = new ManifestCollector();

      const result = collector.build({
        adapterId: 'claude',
        adapterVersion: '1.0.0',
        homeDir: '/home/user',
        adapterHome: '/home/user/.claude',
      });

      expect(result.files).toEqual([]);
      expect(result.directories).toEqual([]);
      expect(result.hooks).toEqual([]);
      expect(result.envVars).toEqual([]);
      expect(result.autoMemoryEnabledSet).toBe(false);
      expect(result.agentFrontmatter).toEqual([]);
      expect(result.memorySeeds).toEqual([]);
      expect(result.skillDirs).toEqual([]);
    });
  });
});
