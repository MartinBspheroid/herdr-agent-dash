import { describe, expect, test } from 'bun:test';

import type { ViewPreferences } from '@/config/schema';
import { BoardError } from '@/app/errors';
import { FixtureTransport, fixtureSnapshot } from '@tests/fixtures/herdr';

const expanded: ViewPreferences = {
  showUnknown: true,
  compactPopup: false,
  popupOrientation: 'horizontal',
};

describe('popup lifecycle', () => {
  test('opens a popup with the persisted outer geometry', async () => {
    const module = await import('../../scripts/open-board-pane');
    expect(typeof module.boardPaneCommand).toBe('function');
    expect(module.boardPaneCommand('popup', expanded, '/bin/herdr')).toEqual([
      '/bin/herdr',
      'plugin',
      'pane',
      'open',
      '--plugin',
      'dev.agent-board',
      '--entrypoint',
      'board-popup',
      '--placement',
      'popup',
      '--focus',
      '--width',
      '90%',
      '--height',
      '85%',
    ]);
    expect(
      module.boardPaneCommand('popup', { ...expanded, compactPopup: true }, '/bin/herdr'),
    ).toContain('120');
  });

  test('does not pass popup dimensions when opening a tab', async () => {
    const module = await import('../../scripts/open-board-pane');
    const command = module.boardPaneCommand('tab', expanded, '/bin/herdr');
    expect(command).not.toContain('--width');
    expect(command).not.toContain('--height');
  });

  test('replaces the active popup using the persisted outer geometry', async () => {
    const module = await import('../../scripts/replace-board-popup');
    const transport = new FixtureTransport(fixtureSnapshot);
    await module.replaceBoardPopup(transport, { ...expanded, compactPopup: true });
    expect(transport.requestCalls).toEqual([
      { method: 'popup.close', params: {} },
      {
        method: 'plugin.pane.open',
        params: {
          plugin_id: 'dev.agent-board',
          entrypoint: 'board-popup',
          placement: 'popup',
          width: 120,
          height: 32,
          focus: true,
        },
      },
    ]);
  });

  test('retries only while Herdr is releasing the prior popup', async () => {
    const module = await import('../../scripts/replace-board-popup');
    const transport = new BusyOnceTransport();
    await module.replaceBoardPopup(transport, expanded, async () => undefined);
    expect(transport.openCalls).toBe(2);
  });
});

class BusyOnceTransport extends FixtureTransport {
  public openCalls = 0;

  public constructor() {
    super(fixtureSnapshot);
  }

  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === 'plugin.pane.open') {
      this.openCalls += 1;
      if (this.openCalls === 1) throw new BoardError('ui_busy', 'popup is still closing');
    }
    return await super.request<T>(method, params);
  }
}
