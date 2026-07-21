import { describe, expect, test } from 'bun:test';
import { act } from 'react';
import { testRender } from '@opentui/react/test-utils';

import type { AgentCard, CommandService } from '@/contracts';
import type { ViewPreferences } from '@/config/schema';
import { DEFAULT_CONFIG } from '@/config/schema';
import { App } from '@/ui/App';
import { createFixtureBoardStore } from '@tests/fixtures/board';

const activeCard: AgentCard = {
  id: 'active',
  agent: 'Claude',
  displayName: 'claude',
  state: 'working',
  focused: false,
  reviewed: false,
  workspaceLabel: 'main',
  tabLabel: 'core',
  paneLabel: 'w2:p1',
  git: { status: 'ready', repoName: 'core', branch: 'main' },
  activity: { candidates: [] },
  connection: 'live',
};

const unknownCard: AgentCard = {
  ...activeCard,
  id: 'unknown',
  displayName: 'term_unknown',
  state: 'unknown',
};

describe('board display shortcuts', () => {
  test('persists unknown, small, and position toggles from the live keyboard', async () => {
    const saved: ViewPreferences[] = [];
    const setup = await testRender(
      <App
        store={createFixtureBoardStore([activeCard, unknownCard])}
        commands={commands}
        mode="tab"
        config={DEFAULT_CONFIG}
        savePreferences={(preferences) => {
          saved.push(preferences);
          return Promise.resolve();
        }}
      />,
      { width: 180, height: 40 },
    );
    try {
      await act(async () => setup.flush());
      expect(setup.captureCharFrame()).toContain('UNKNOWN');

      act(() => pressKey(setup.renderer, 'u'));
      await act(async () => setup.flush());
      expect(saved.at(-1)?.showUnknown).toBe(false);
      expect(setup.captureCharFrame()).not.toContain('UNKNOWN');

      act(() => pressKey(setup.renderer, 's'));
      await act(async () => setup.flush());
      expect(setup.captureCharFrame()).not.toContain('REPOSITORY');
      expect(saved.at(-1)?.compact).toBe(true);

      act(() => pressKey(setup.renderer, 'p'));
      await act(async () => setup.flush());
      expect(saved.at(-1)?.detailPosition).toBe('vertical');
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
});

const commands: CommandService = {
  focusAgent: async () => ({ ok: true, message: 'focused' }),
  refreshAll: async () => ({ ok: true, message: 'refreshed' }),
  refreshGit: async () => ({ ok: true, message: 'refreshed' }),
  loadRecentOutput: async () => ({ ok: false, message: 'unavailable' }),
  close: async () => undefined,
};

function pressKey(
  renderer: { readonly keyInput: { processParsedKey(key: ParsedKey): boolean } },
  name: string,
): void {
  renderer.keyInput.processParsedKey({
    name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: name,
    number: false,
    raw: name,
    eventType: 'press',
    source: 'raw',
  });
}

interface ParsedKey {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly option: boolean;
  readonly sequence: string;
  readonly number: boolean;
  readonly raw: string;
  readonly eventType: 'press';
  readonly source: 'raw';
}
