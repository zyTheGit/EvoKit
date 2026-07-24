import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import fse from 'fs-extra';
import {
  manifestPath,
  ensureManifestDir,
  readManifest,
  writeManifest,
  updateAdapterManifest,
  removeAdapterFromManifest,
  hasRemainingAdapters,
} from '../../src/core/manifest.js';
import type { AdapterManifest, EvoKitManifest } from '../../src/core/manifest.js';

let tmpHome: string;

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-manifest-'));
}

function makeAdapter(overrides: Partial<AdapterManifest> = {}): AdapterManifest {
  return {
    adapterId: 'claude',
    adapterVersion: '1.0.0',
    installedAt: new Date().toISOString(),
    homeDir: tmpHome,
    adapterHome: path.join(tmpHome, '.claude'),
    files: [],
    directories: [],
    hooks: [],
    envVars: [],
    autoMemoryEnabledSet: false,
    agentFrontmatter: [],
    memorySeeds: [],
    skillDirs: [],
    ...overrides,
  };
}

describe('manifest', () => {
  beforeEach(() => {
    tmpHome = tmpDir();
  });

  afterEach(() => {
    fse.removeSync(tmpHome);
  });

  // ─── manifestPath ──────────────────────────────────────────

  describe('manifestPath', () => {
    it('returns path under .evokit/ directory', () => {
      expect(manifestPath('/home/user')).toBe('/home/user/.evokit/manifest.json');
    });
  });

  // ─── ensureManifestDir ─────────────────────────────────────

  describe('ensureManifestDir', () => {
    it('creates .evokit/ directory if it does not exist', () => {
      ensureManifestDir(tmpHome);
      expect(fs.existsSync(path.join(tmpHome, '.evokit'))).toBe(true);
    });

    it('does not throw if directory already exists', () => {
      fse.ensureDirSync(path.join(tmpHome, '.evokit'));
      expect(() => ensureManifestDir(tmpHome)).not.toThrow();
    });
  });

  // ─── readManifest ──────────────────────────────────────────

  describe('readManifest', () => {
    it('returns null for non-existent file', () => {
      expect(readManifest(tmpHome)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      ensureManifestDir(tmpHome);
      fs.writeFileSync(manifestPath(tmpHome), 'not valid json{{{', 'utf-8');
      expect(readManifest(tmpHome)).toBeNull();
    });

    it('reads a valid manifest', () => {
      const manifest: EvoKitManifest = {
        version: 1,
        evokitVersion: '0.4.13',
        updatedAt: new Date().toISOString(),
        adapters: {},
      };
      ensureManifestDir(tmpHome);
      fs.writeFileSync(manifestPath(tmpHome), JSON.stringify(manifest, null, 2), 'utf-8');

      const result = readManifest(tmpHome);
      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.evokitVersion).toBe('0.4.13');
    });
  });

  // ─── writeManifest ─────────────────────────────────────────

  describe('writeManifest', () => {
    it('writes and reads manifest round-trip', () => {
      const manifest: EvoKitManifest = {
        version: 1,
        evokitVersion: '0.4.13',
        updatedAt: new Date().toISOString(),
        adapters: {
          claude: makeAdapter(),
        },
      };

      writeManifest(tmpHome, manifest);
      const result = readManifest(tmpHome);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.evokitVersion).toBe('0.4.13');
      expect(result!.adapters.claude).toBeDefined();
      expect(result!.adapters.claude.adapterId).toBe('claude');
    });

    it('creates .evokit/ directory automatically', () => {
      const manifest: EvoKitManifest = {
        version: 1,
        evokitVersion: '0.4.13',
        updatedAt: new Date().toISOString(),
        adapters: {},
      };

      writeManifest(tmpHome, manifest);
      expect(fs.existsSync(path.join(tmpHome, '.evokit'))).toBe(true);
      expect(fs.existsSync(manifestPath(tmpHome))).toBe(true);
    });

    it('writes valid JSON (atomic write verification)', () => {
      const manifest: EvoKitManifest = {
        version: 1,
        evokitVersion: '0.4.13',
        updatedAt: new Date().toISOString(),
        adapters: {},
      };

      writeManifest(tmpHome, manifest);

      // File should be valid JSON
      const raw = fs.readFileSync(manifestPath(tmpHome), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('does not leave .tmp file after successful write', () => {
      const manifest: EvoKitManifest = {
        version: 1,
        evokitVersion: '0.4.13',
        updatedAt: new Date().toISOString(),
        adapters: {},
      };

      writeManifest(tmpHome, manifest);
      expect(fs.existsSync(manifestPath(tmpHome) + '.tmp')).toBe(false);
    });
  });

  // ─── updateAdapterManifest ─────────────────────────────────

  describe('updateAdapterManifest', () => {
    it('creates new manifest when none exists', () => {
      const adapter = makeAdapter();
      updateAdapterManifest(tmpHome, adapter, '0.4.13');

      const result = readManifest(tmpHome);
      expect(result).not.toBeNull();
      expect(result!.adapters.claude).toBeDefined();
      expect(result!.adapters.claude.adapterVersion).toBe('1.0.0');
    });

    it('overwrites existing adapter record (upgrade scenario)', () => {
      const adapterV1 = makeAdapter({ adapterVersion: '1.0.0' });
      updateAdapterManifest(tmpHome, adapterV1, '0.4.13');

      const adapterV2 = makeAdapter({ adapterVersion: '2.0.0' });
      updateAdapterManifest(tmpHome, adapterV2, '0.4.14');

      const result = readManifest(tmpHome);
      expect(result!.adapters.claude.adapterVersion).toBe('2.0.0');
      expect(result!.evokitVersion).toBe('0.4.14');
    });

    it('preserves other adapter records', () => {
      const claudeAdapter = makeAdapter({ adapterId: 'claude' });
      updateAdapterManifest(tmpHome, claudeAdapter, '0.4.13');

      const codexAdapter = makeAdapter({
        adapterId: 'codex',
        adapterHome: path.join(tmpHome, '.codex'),
      });
      updateAdapterManifest(tmpHome, codexAdapter, '0.4.13');

      const result = readManifest(tmpHome);
      expect(result!.adapters.claude).toBeDefined();
      expect(result!.adapters.codex).toBeDefined();
      expect(result!.adapters.codex.adapterId).toBe('codex');
    });
  });

  // ─── removeAdapterFromManifest ─────────────────────────────

  describe('removeAdapterFromManifest', () => {
    it('removes only the specified adapter', () => {
      const claudeAdapter = makeAdapter({ adapterId: 'claude' });
      updateAdapterManifest(tmpHome, claudeAdapter, '0.4.13');

      const codexAdapter = makeAdapter({
        adapterId: 'codex',
        adapterHome: path.join(tmpHome, '.codex'),
      });
      updateAdapterManifest(tmpHome, codexAdapter, '0.4.13');

      removeAdapterFromManifest(tmpHome, 'claude');

      const result = readManifest(tmpHome);
      expect(result!.adapters.claude).toBeUndefined();
      expect(result!.adapters.codex).toBeDefined();
    });

    it('leaves empty adapters object when last adapter removed', () => {
      const adapter = makeAdapter({ adapterId: 'claude' });
      updateAdapterManifest(tmpHome, adapter, '0.4.13');

      removeAdapterFromManifest(tmpHome, 'claude');

      const result = readManifest(tmpHome);
      expect(result).not.toBeNull();
      expect(result!.adapters).toEqual({});
    });

    it('does nothing if manifest does not exist', () => {
      expect(() => removeAdapterFromManifest(tmpHome, 'claude')).not.toThrow();
    });
  });

  // ─── hasRemainingAdapters ──────────────────────────────────

  describe('hasRemainingAdapters', () => {
    it('returns false when no manifest exists', () => {
      expect(hasRemainingAdapters(tmpHome)).toBe(false);
    });

    it('returns true when adapters remain', () => {
      const adapter = makeAdapter({ adapterId: 'claude' });
      updateAdapterManifest(tmpHome, adapter, '0.4.13');
      expect(hasRemainingAdapters(tmpHome)).toBe(true);
    });

    it('returns false when all adapters have been removed', () => {
      const adapter = makeAdapter({ adapterId: 'claude' });
      updateAdapterManifest(tmpHome, adapter, '0.4.13');
      removeAdapterFromManifest(tmpHome, 'claude');
      expect(hasRemainingAdapters(tmpHome)).toBe(false);
    });
  });
});
