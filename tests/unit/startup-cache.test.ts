import { describe, expect, test } from 'bun:test';

import type { AgentCard } from '@/contracts';
import { createTempDirectory, removeTempDirectory } from '@tests/fixtures/helpers';

const card: AgentCard = {
  id: 'term-1',
  terminalId: 'term-1',
  agent: 'Claude',
  displayName: 'claude',
  state: 'working',
  focused: false,
  reviewed: false,
  workspaceLabel: 'main',
  tabLabel: 'review',
  paneLabel: 'w2:p1',
  effectiveCwd: '/tmp/project',
  git: { status: 'ready', repoName: 'project', branch: 'main', changedFiles: 2 },
  activity: {
    currentSignal: {
      text: 'Reviewing architecture',
      source: 'terminal_title',
      semantics: 'current_signal',
      confidence: 'derived',
      sourceLabel: 'Terminal title',
      stale: false,
    },
    recentOutput: {
      text: 'secret raw terminal output',
      source: 'terminal_output',
      semantics: 'raw_output',
      confidence: 'raw',
      sourceLabel: 'Terminal output',
      stale: false,
    },
    candidates: [],
  },
  connection: 'live',
};

describe('startup card cache', () => {
  test('restores bounded stale display cards without terminal output', async () => {
    const directory = await createTempDirectory('herdr-board-startup-cache');
    const path = `${directory}/startup-cache.json`;
    try {
      const module = await import('@/cache/startup-cache');
      expect(typeof module.JsonStartupCache).toBe('function');
      const cache = new module.JsonStartupCache(path, { maxAgeMs: 1_000, maxCards: 10 });
      await cache.save([card], 1_000);
      const restored = await cache.load(1_500);
      expect(restored).toHaveLength(1);
      expect(restored[0]?.connection).toBe('stale');
      expect(restored[0]?.activity.currentSignal?.stale).toBe(true);
      expect(restored[0]?.activity.recentOutput).toBeUndefined();
      expect(await Bun.file(path).text()).not.toContain('secret raw terminal output');
      expect(await cache.load(2_001)).toEqual([]);
    } finally {
      await removeTempDirectory(directory);
    }
  });

  test('ignores malformed cache files instead of blocking startup', async () => {
    const directory = await createTempDirectory('herdr-board-broken-cache');
    const path = `${directory}/startup-cache.json`;
    try {
      await Bun.write(path, '{broken');
      const { JsonStartupCache } = await import('@/cache/startup-cache');
      const cache = new JsonStartupCache(path, { maxAgeMs: 1_000, maxCards: 10 });
      expect(await cache.load(1_000)).toEqual([]);
    } finally {
      await removeTempDirectory(directory);
    }
  });
});
