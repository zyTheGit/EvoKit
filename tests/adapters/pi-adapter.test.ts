import { describe, it, expect } from 'vitest';
import { PiAdapter } from '../../src/adapters/pi/adapter.js';

const CONFIG = {
  homeDir: '/tmp/test-home',
  templateDir: '/tmp/test-template',
};

describe('pi-adapter', () => {
  const adapter = new PiAdapter();

  it('has correct metadata', () => {
    expect(adapter.id).toBe('pi');
    expect(adapter.label).toBe('Pi CLI');
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
