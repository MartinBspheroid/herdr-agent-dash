import { BoardError } from '@/app/errors';
import type { EventSubscription, HerdrEvent, HerdrEventStream } from '@/contracts';
import { AsyncQueue } from '@/herdr/async-queue';
import { fixtureSnapshot, FixtureTransport } from '@tests/fixtures/herdr';

/** Fixture transport whose snapshot can become malformed after startup. */
export class MutableSnapshotTransport extends FixtureTransport {
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

/** Fixture transport that lets tests resolve concurrent snapshots out of order. */
export class OrderedSnapshotTransport extends FixtureTransport {
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

  /** Resolve the first pending snapshot request. */
  public resolveFirst(value: unknown): void {
    this.firstResolver?.(value);
  }

  /** Resolve the second pending snapshot request. */
  public resolveSecond(value: unknown): void {
    this.secondResolver?.(value);
  }
}

/** Fixture transport whose first event stream ends and then reconnects. */
export class ReconnectingTransport extends FixtureTransport {
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

  public override async subscribe(): Promise<HerdrEventStream> {
    this.subscriptions += 1;
    if (this.subscriptions === 1)
      return { [Symbol.asyncIterator]: async function* () {}, close: () => undefined };
    return this.events;
  }
}

/** Fixture transport that exposes snapshot-only fallback behavior. */
export class NoEventsTransport extends FixtureTransport {
  public snapshotRequests = 0;

  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === 'session.snapshot') this.snapshotRequests += 1;
    return await super.request<T>(method, params);
  }

  public override async subscribe(): Promise<HerdrEventStream> {
    throw new BoardError('events_unavailable', 'events unavailable in CLI fallback');
  }
}

/** Fixture transport that creates a fresh stream for each topology subscription set. */
export class TopologyTransport extends FixtureTransport {
  public readonly streams: AsyncQueue<HerdrEvent>[] = [];

  public constructor() {
    super(fixtureSnapshot);
  }

  public override async subscribe(
    subscriptions: readonly EventSubscription[],
  ): Promise<HerdrEventStream> {
    this.subscribeCalls += 1;
    this.subscriptionRequests.push(subscriptions);
    const stream = new AsyncQueue<HerdrEvent>();
    this.streams.push(stream);
    return stream;
  }

  public override async close(): Promise<void> {
    for (const stream of this.streams) stream.close();
    await super.close();
  }
}
