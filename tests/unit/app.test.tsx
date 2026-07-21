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
  test('persists unknown visibility and replaces the popup for geometry toggles', async () => {
    const saved: ViewPreferences[] = [];
    let geometryCalls = 0;
    const setup = await testRender(
      <App
        store={createFixtureBoardStore([activeCard, unknownCard])}
        commands={createCommands(() => {
          geometryCalls += 1;
        })}
        mode="popup"
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
      await act(async () => {
        await waitFor(() => geometryCalls === 1);
        setup.flush();
      });
      expect(setup.captureCharFrame()).toContain('REPOSITORY');
      expect(saved.at(-1)?.compactPopup).toBe(true);

      act(() => pressKey(setup.renderer, 'p'));
      await act(async () => {
        await waitFor(() => geometryCalls === 2);
        setup.flush();
      });
      expect(saved.at(-1)?.popupOrientation).toBe('vertical');
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
});

function createCommands(onGeometry: () => void): CommandService {
  return {
    focusAgent: async () => ({ ok: true, message: 'focused' }),
    refreshAll: async () => ({ ok: true, message: 'refreshed' }),
    refreshGit: async () => ({ ok: true, message: 'refreshed' }),
    loadRecentOutput: async () => ({ ok: false, message: 'unavailable' }),
    applyPopupGeometry: async () => {
      onGeometry();
      return { ok: true, message: 'applying' };
    },
    close: async () => undefined,
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition did not become true');
}

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
