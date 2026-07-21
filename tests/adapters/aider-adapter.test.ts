import { describe, it, expect } from 'vitest';
import { AiderAdapter } from '../../src/adapters/aider/adapter.js';

const CONFIG = {
  homeDir: '/tmp/test-home',
  templateDir: '/tmp/test-template',
};

describe('aider-adapter', () => {
  const adapter = new AiderAdapter();

  it('has correct metadata', () => {
    expect(adapter.id).toBe('aider');
    expect(adapter.label).toBe('Aider');
    expect(adapter.version).toBe('0.0.1');
    expect(adapter.experimental).toBe(true);
  });

  it('install() throws "not yet implemented"', () => {
    expect(() => adapter.install(CONFIG)).toThrow('not yet implemented');
  });

  it('verify() returns a single failing check', () => {
    const checks = adapter.verify(CONFIG);
    expect(checks).toHaveLength(1);
    expect(checks[0].pass).toBe(false);
    expect(checks[0].detail).toContain('Not yet implemented');
  });

  it('status() returns not-installed AdapterStatus', () => {
    const status = adapter.status(CONFIG);
    expect(status.installed).toBe(false);
    expect(status.allPass).toBe(false);
    expect(status.adapterHome).toBe('');
    expect(status.checks).toHaveLength(1);
    expect(status.checks[0].pass).toBe(false);
  });
});
