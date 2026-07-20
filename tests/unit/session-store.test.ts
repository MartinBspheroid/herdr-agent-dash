import { describe, expect, test } from 'bun:test';

import { SystemClock } from '@/app/runtime';
import { BoardError } from '@/app/errors';
import { LiveSessionStore } from '@/herdr/session-store';
import { fixtureSnapshot, FixtureTransport } from '@tests/fixtures/herdr';

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

class MutableSnapshotTransport extends FixtureTransport {
  public snapshotValue: unknown;

  public constructor(snapshot: unknown) {
    super(snapshot);
    this.snapshotValue = snapshot;
  }

  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === 'session.snapshot') {
      this.requests.push(method);
      this.requestCalls.push({ method, params });
      return this.snapshotValue as T;
    }
    return await super.request<T>(method, params);
  }
}

class OrderedSnapshotTransport extends FixtureTransport {
  public pending = 0;
  private firstResolver: ((value: unknown) => void) | undefined;
  private secondResolver: ((value: unknown) => void) | undefined;

  public constructor() {
    super(fixtureSnapshot);
  }

  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method !== 'session.snapshot') return await super.request<T>(method, params);
    this.pending += 1;
    return await new Promise<T>((resolve) => {
      if (this.pending === 1) this.firstResolver = resolve as (value: unknown) => void;
      else this.secondResolver = resolve as (value: unknown) => void;
    });
  }

  public resolveFirst(value: unknown): void {
    this.firstResolver?.(value);
  }

  public resolveSecond(value: unknown): void {
    this.secondResolver?.(value);
  }
}

class ReconnectingTransport extends FixtureTransport {
  public snapshots = 0;
  public subscriptions = 0;

  public constructor() {
    super(fixtureSnapshot);
  }

  public override async request<T>(method: string): Promise<T> {
    if (method === 'session.snapshot') {
      this.snapshots += 1;
      if (this.snapshots > 1)
        return {
          ...fixtureSnapshot,
          panes: [
            ...fixtureSnapshot.panes,
            {
              id: 'p3',
              terminal_id: 'term-3',
              tab_id: 't1',
              workspace_id: 'w1',
              agent_id: 'a3',
              agent: 'Pi',
              agent_status: 'idle',
            },
          ],
          agents: [...fixtureSnapshot.agents, { id: 'a3', name: 'Pi', status: 'idle' }],
        } as T;
    }
    return await super.request<T>(method);
  }

  public override async subscribe(): Promise<
    AsyncIterable<{ readonly event: string; readonly payload: unknown }>
  > {
    this.subscriptions += 1;
    if (this.subscriptions === 1) return { [Symbol.asyncIterator]: async function* () {} };
    return this.events;
  }
}

class NoEventsTransport extends FixtureTransport {
  public snapshotRequests = 0;

  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === 'session.snapshot') this.snapshotRequests += 1;
    return await super.request<T>(method, params);
  }

  public override async subscribe(): Promise<
    AsyncIterable<{
      readonly event: string;
      readonly payload: unknown;
    }>
  > {
    throw new BoardError('events_unavailable', 'events unavailable in CLI fallback');
  }
}

async function waitFor(predicate: () => boolean, attempts = 20, delay = 1): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('condition did not become true');
}
