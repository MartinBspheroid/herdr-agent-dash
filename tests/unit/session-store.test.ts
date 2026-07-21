import { describe, expect, test } from 'bun:test';

import { SystemClock } from '@/app/runtime';
import { LiveSessionStore } from '@/herdr/session-store';
import { fixtureSnapshot, FixtureTransport } from '@tests/fixtures/herdr';
import {
  MutableSnapshotTransport,
  NoEventsTransport,
  OrderedSnapshotTransport,
  ReconnectingTransport,
  TopologyTransport,
} from '@tests/fixtures/session-transports';

describe('live session store', () => {
  test('bootstraps, applies status events immediately, and disposes transport', async () => {
    const transport = new FixtureTransport(fixtureSnapshot);
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    transport.emit('pane.agent_status_changed', { pane_id: 'p1', agent_status: 'blocked' });
    await waitFor(() => store.getSnapshot().panes.get('p1')?.agentStatus === 'blocked');
    expect(store.getSnapshot().connection).toBe('live');
    expect(store.getSnapshot().agents.get('a1')?.status).toBe('blocked');
    await store.dispose();
    expect(transport.closed).toBe(true);
  });

  test('scopes agent-status subscriptions to panes and omits command-only streams', async () => {
    const transport = new FixtureTransport(fixtureSnapshot);
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    await waitFor(() => transport.subscriptionRequests.length === 1);
    const subscriptions = transport.subscriptionRequests[0] ?? [];
    const statuses = subscriptions.filter(
      (subscription) => subscription.type === 'pane.agent_status_changed',
    );
    expect(statuses).toHaveLength(2);
    expect(statuses.map((subscription) => subscription.pane_id)).toEqual(['p1', 'p2']);
    expect(subscriptions.some((subscription) => subscription.type === 'pane.output_matched')).toBe(
      false,
    );
    expect(subscriptions.some((subscription) => subscription.type === 'pane.scroll_changed')).toBe(
      false,
    );
    await store.dispose();
  });

  test('rebuilds scoped subscriptions when a pane is created', async () => {
    const transport = new TopologyTransport();
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    await waitFor(() => transport.streams.length === 1);
    transport.streams[0]?.push({
      event: 'pane.created',
      payload: {
        pane: {
          id: 'p3',
          terminal_id: 'term-3',
          tab_id: 't1',
          workspace_id: 'w1',
          agent_status: 'idle',
        },
      },
    });
    await waitFor(() => transport.subscriptionRequests.length === 2);
    expect(
      transport.subscriptionRequests[1]?.some(
        (subscription) =>
          subscription.type === 'pane.agent_status_changed' && subscription.pane_id === 'p3',
      ),
    ).toBe(true);
    expect(store.getSnapshot().connection).toBe('live');
    await store.dispose();
  });

  test('ignores an event with an older revision', async () => {
    const transport = new FixtureTransport(fixtureSnapshot);
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    transport.emit('pane.updated', {
      pane: { id: 'p1', agent_status: 'done', revision: 5 },
    });
    await waitFor(() => store.getSnapshot().panes.get('p1')?.agentStatus === 'done');
    transport.emit('pane.updated', {
      pane: { id: 'p1', agent_status: 'blocked', revision: 4 },
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(store.getSnapshot().panes.get('p1')?.agentStatus).toBe('done');
    await store.dispose();
  });

  test('surfaces an actionable protocol diagnostic', async () => {
    const transport = new FixtureTransport({ ...fixtureSnapshot, protocol_version: 0 });
    const store = new LiveSessionStore(transport, new SystemClock());
    await expect(store.start()).rejects.toMatchObject({ code: 'protocol_incompatible' });
    expect(store.getSnapshot().message).toContain('update Herdr');
    expect(store.getSnapshot().connection).toBe('incompatible');
    await store.dispose();
  });

  test('keeps cached data stale during disconnect and resnapshots on reconnect', async () => {
    const transport = new ReconnectingTransport();
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    await waitFor(() => transport.snapshots >= 2, 60, 10);
    expect(store.getSnapshot().connection).toBe('live');
    expect(store.getSnapshot().panes.has('p3')).toBe(true);
    await store.dispose();
  });

  test('does not report live between a dropped stream and its replacement subscription', async () => {
    const transport = new ReconnectingTransport();
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    await waitFor(() => store.getSnapshot().connection === 'stale', 40, 10);
    expect(transport.snapshots).toBe(2);
    expect(transport.subscriptions).toBe(1);
    await waitFor(() => transport.subscriptions >= 2, 40, 10);
    await waitFor(() => store.getSnapshot().connection === 'live', 40, 10);
    expect(transport.snapshots).toBeGreaterThanOrEqual(3);
    await store.dispose();
  });

  test('does not poll snapshots when the CLI fallback has no event stream', async () => {
    const transport = new NoEventsTransport(fixtureSnapshot);
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    await waitFor(() => store.getSnapshot().message !== undefined);
    expect(store.getSnapshot().message).toContain('press r');
    expect(transport.snapshotRequests).toBe(1);
    await store.refresh();
    expect(store.getSnapshot().connection).toBe('stale');
    expect(transport.snapshotRequests).toBe(2);
    await store.dispose();
  });

  test('retains the last valid snapshot when a refresh is malformed', async () => {
    const transport = new MutableSnapshotTransport(fixtureSnapshot);
    const store = new LiveSessionStore(transport, new SystemClock());
    await store.start();
    transport.snapshotValue = { not_a_snapshot: true };
    await expect(store.refresh()).rejects.toMatchObject({ code: 'protocol_malformed' });
    expect(store.getSnapshot().panes.has('p1')).toBe(true);
    expect(store.getSnapshot().connection).toBe('stale');
    await store.dispose();
  });

  test('does not let an older concurrent refresh overwrite a newer result', async () => {
    const transport = new OrderedSnapshotTransport();
    const store = new LiveSessionStore(transport, new SystemClock());
    const first = store.refresh();
    const second = store.refresh();
    await waitFor(() => transport.pending === 2);
    transport.resolveSecond({ ...fixtureSnapshot, panes: [] });
    transport.resolveFirst(fixtureSnapshot);
    await Promise.all([first, second]);
    expect(store.getSnapshot().panes.size).toBe(0);
    await store.dispose();
  });

  test('makes start and dispose idempotent', async () => {
    const transport = new FixtureTransport(fixtureSnapshot);
    const store = new LiveSessionStore(transport, new SystemClock());
    await Promise.all([store.start(), store.start()]);
    expect(transport.subscribeCalls).toBe(1);
    await Promise.all([store.dispose(), store.dispose()]);
    expect(transport.closed).toBe(true);
  });
});

async function waitFor(predicate: () => boolean, attempts = 20, delay = 1): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('condition did not become true');
}
