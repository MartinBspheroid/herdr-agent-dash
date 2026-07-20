import { describe, expect, test } from 'bun:test';

import { fixtureSnapshot } from '@tests/fixtures/herdr';
import { applyHerdrEvent } from '@/herdr/event-reducer';
import { normalizeSnapshot } from '@/herdr/protocol';

describe('Herdr event reducer', () => {
  test('updates a pane move while retaining stable terminal identity', () => {
    const initial = normalizeSnapshot(fixtureSnapshot);
    const next = applyHerdrEvent(initial, {
      event: 'pane.moved',
      payload: { pane: { id: 'p1', tab_id: 't2', workspace_id: 'w2' } },
    });
    expect(next.panes.get('p1')?.terminalId).toBe('term-1');
    expect(next.panes.get('p1')?.tabId).toBe('t2');
    expect(next.panes.get('p1')?.workspaceId).toBe('w2');
  });

  test('removes an agent only after its pane closes', () => {
    const initial = normalizeSnapshot(fixtureSnapshot);
    const next = applyHerdrEvent(initial, { event: 'pane.closed', payload: { pane_id: 'p2' } });
    expect(next.agents.has('a2')).toBe(false);
    expect(next.agents.has('a1')).toBe(true);
  });

  test('retains metadata on partial pane updates and handles workspace closure', () => {
    const initial = normalizeSnapshot(fixtureSnapshot);
    const updated = applyHerdrEvent(initial, {
      event: 'pane.updated',
      payload: { pane: { id: 'p1', agent_status: 'blocked' } },
    });
    expect(updated.panes.get('p1')?.metadata.summary).toBe('Reviewing cache');
    expect(updated.panes.get('p1')?.agentStatus).toBe('blocked');

    const closed = applyHerdrEvent(updated, {
      event: 'workspace.closed',
      payload: { workspace: { id: 'w1' } },
    });
    expect(closed.workspaces.has('w1')).toBe(false);
    expect(closed.panes.size).toBe(0);
    expect(closed.agents.size).toBe(0);
  });

  test('accepts official nested pane ids and camel-case partial fields', () => {
    const initial = normalizeSnapshot(fixtureSnapshot);
    const updated = applyHerdrEvent(initial, {
      event: 'pane.updated',
      payload: { pane: { pane_id: 'p1', agentStatus: 'done' } },
    });
    expect(updated.panes.get('p1')?.agentStatus).toBe('done');
    expect(updated.panes.get('p1')?.terminalId).toBe('term-1');
  });

  test('rejects stale workspace and tab revisions', () => {
    const initial = normalizeSnapshot(fixtureSnapshot);
    const workspaceUpdated = applyHerdrEvent(initial, {
      event: 'workspace.updated',
      payload: { workspace: { id: 'w1', label: 'new', revision: 5 } },
    });
    const workspaceStale = applyHerdrEvent(workspaceUpdated, {
      event: 'workspace.updated',
      payload: { workspace: { id: 'w1', label: 'old', revision: 4 } },
    });
    expect(workspaceStale.workspaces.get('w1')?.label).toBe('new');

    const tabUpdated = applyHerdrEvent(initial, {
      event: 'tab.renamed',
      payload: { tab: { id: 't1', workspace_id: 'w1', label: 'new', revision: 5 } },
    });
    const tabStale = applyHerdrEvent(tabUpdated, {
      event: 'tab.renamed',
      payload: { tab: { id: 't1', workspace_id: 'w1', label: 'old', revision: 4 } },
    });
    expect(tabStale.tabs.get('t1')?.label).toBe('new');
  });

  test('removes the old agent when a terminal moves to a replacement pane', () => {
    const initial = normalizeSnapshot(fixtureSnapshot);
    const next = applyHerdrEvent(initial, {
      event: 'pane.updated',
      payload: {
        pane: {
          pane_id: 'p1-new',
          terminal_id: 'term-1',
          tab_id: 't1',
          workspace_id: 'w1',
          agent_id: 'replacement',
          agent: 'Replacement',
          agent_status: 'working',
        },
      },
    });
    expect(next.panes.has('p1')).toBe(false);
    expect(next.panes.has('p1-new')).toBe(true);
    expect(next.agents.has('a1')).toBe(false);
    expect(next.agents.has('replacement')).toBe(true);
  });
});
