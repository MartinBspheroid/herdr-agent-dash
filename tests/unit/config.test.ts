import { describe, expect, test } from 'bun:test';

import { DEFAULT_CONFIG, validateConfig } from '@/config/schema';

describe('configuration validation', () => {
  test('falls back per invalid field and never enables network access', () => {
    const result = validateConfig({
      view: { defaultSort: 'invalid' },
      git: { maxConcurrency: 100 },
      privacy: { networkAccess: true },
    });
    expect(result.config.view.defaultSort).toBe(DEFAULT_CONFIG.view.defaultSort);
    expect(result.config.git.maxConcurrency).toBe(DEFAULT_CONFIG.git.maxConcurrency);
    expect(result.config.privacy.networkAccess).toBe(false);
    expect(result.warnings.length).toBe(3);
  });

  test('rejects persistence flags instead of enabling raw-data storage', () => {
    const result = validateConfig({
      privacy: { persistTimeline: true, persistTerminalOutput: true },
    });
    expect(result.config.privacy.persistTimeline).toBe(false);
    expect(result.config.privacy.persistTerminalOutput).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });

  test('removes unknown renderer columns instead of silently rendering blank cells', () => {
    const result = validateConfig({ view: { visibleColumns: ['state', 'unknown'] } });
    expect(result.config.view.visibleColumns).toEqual(['state']);
    expect(result.warnings).toContain('view.visibleColumns: unknown columns were removed');
  });
});
