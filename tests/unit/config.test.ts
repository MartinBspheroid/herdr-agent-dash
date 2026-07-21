import { describe, expect, test } from 'bun:test';

import { DEFAULT_CONFIG, validateConfig } from '@/config/schema';
import {
  createFixtureFile,
  createTempDirectory,
  removeTempDirectory,
} from '@tests/fixtures/helpers';

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

  test('validates persistent display preferences independently', () => {
    const result = validateConfig({
      view: { showUnknown: false, compactPopup: true, popupOrientation: 'vertical' },
    });
    expect(result.config.view.showUnknown).toBe(false);
    expect(result.config.view.compactPopup).toBe(true);
    expect(result.config.view.popupOrientation).toBe('vertical');
  });

  test('migrates the previous internal-layout preference names to popup geometry', () => {
    const result = validateConfig({ view: { compact: true, detailPosition: 'vertical' } });
    expect(result.config.view.compactPopup).toBe(true);
    expect(result.config.view.popupOrientation).toBe('vertical');
  });

  test('persists display preferences without replacing unrelated configuration', async () => {
    const directory = await createTempDirectory('herdr-board-preferences');
    const path = `${directory}/config.json`;
    await createFixtureFile(
      directory,
      'config.json',
      JSON.stringify({ view: { defaultSort: 'state' }, git: { enabled: false } }),
    );
    try {
      const module = await import('@/config/load-config');
      expect(typeof module.saveViewPreferences).toBe('function');
      await module.saveViewPreferences(path, {
        showUnknown: false,
        compactPopup: true,
        popupOrientation: 'vertical',
      });
      const saved = JSON.parse(await Bun.file(path).text()) as {
        readonly view: Readonly<Record<string, unknown>>;
        readonly git: Readonly<Record<string, unknown>>;
      };
      expect(saved.view.defaultSort).toBe('state');
      expect(saved.view.showUnknown).toBe(false);
      expect(saved.view.compactPopup).toBe(true);
      expect(saved.view.popupOrientation).toBe('vertical');
      expect(saved.git.enabled).toBe(false);
    } finally {
      await removeTempDirectory(directory);
    }
  });
});
