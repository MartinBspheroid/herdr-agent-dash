import { BoardError, errorMessage } from '@/app/errors';
import type {
  AgentRecord,
  Clock,
  CurrentAgentTarget,
  HerdrEvent,
  HerdrTransport,
  SessionStore,
  SessionStoreSnapshot,
} from '@/contracts';
import { applyHerdrEvent } from '@/herdr/event-reducer';
import { parseSnapshot } from '@/herdr/protocol';

const RECONNECT_DELAYS_MS = [200, 400, 800, 1_600, 3_200, 5_000] as const;
const MINIMUM_PROTOCOL_VERSION = 1;
const EVENTS_UNAVAILABLE_MESSAGE = 'Live Herdr events are unavailable; press r to refresh';

/** Event-driven normalized Herdr session cache with stale-data recovery. */
export class LiveSessionStore implements SessionStore {
  private snapshot: SessionStoreSnapshot = emptySnapshot();
  private readonly listeners = new Set<() => void>();
  private monitoring = false;
  private disposed = false;
  private monitorPromise: Promise<void> | undefined;
  private eventStreamUnavailable = false;
  private eventSequence = 0;
  private refreshGeneration = 0;
  private startPromise: Promise<void> | undefined;
  private readonly stopped: Promise<void>;
  private resolveStopped: (() => void) | undefined;

  /** Create a store that owns the supplied transport but not its process. */
  public constructor(
    private readonly transport: HerdrTransport,
    private readonly clock: Clock,
  ) {
    this.stopped = new Promise<void>((resolve) => {
      this.resolveStopped = resolve;
    });
  }

  /** Bootstrap the snapshot and start the background event monitor. */
  public async start(): Promise<void> {
    if (this.disposed) throw new BoardError('session_disposed', 'Herdr session is disposed');
    if (this.startPromise !== undefined) return this.startPromise;
    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } catch (error) {
      this.startPromise = undefined;
      throw error;
    }
  }

  /** Return the latest immutable cache snapshot. */
  public getSnapshot(): SessionStoreSnapshot {
    return this.snapshot;
  }

  /** Subscribe to snapshot changes. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replace the cache atomically with a fresh session snapshot. */
  public async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration;
    this.setSnapshot({ ...this.snapshot, connection: 'connecting' });
    try {
      const payload = await this.transport.request<unknown>('session.snapshot');
      if (generation !== this.refreshGeneration) return;
      const parsed = parseSnapshot(payload, 'live');
      if (!parsed.ok) throw new BoardError('protocol_malformed', parsed.message);
      if (this.disposed) return;
      const next = parsed.snapshot;
      if (next.protocolVersion !== undefined && next.protocolVersion < MINIMUM_PROTOCOL_VERSION) {
        const message = `Herdr protocol ${next.protocolVersion} is unsupported; update Herdr to a compatible release`;
        this.setSnapshot({ ...this.snapshot, connection: 'incompatible', message });
        throw new BoardError('protocol_incompatible', message);
      }
      this.setSnapshot({
        ...next,
        connection: this.eventStreamUnavailable ? this.fallbackConnection(next.panes.size) : 'live',
        message: this.eventStreamUnavailable ? EVENTS_UNAVAILABLE_MESSAGE : undefined,
        lastEventType: undefined,
        lastEventSequence: undefined,
        lastSynchronizedAt: this.clock.now(),
      });
    } catch (error) {
      if (generation !== this.refreshGeneration) return;
      if (error instanceof BoardError && error.code === 'protocol_incompatible') {
        if (this.snapshot.connection !== 'incompatible')
          this.setSnapshot({ ...this.snapshot, connection: 'incompatible' });
        throw error;
      }
      const connection =
        this.snapshot.workspaces.size > 0 || this.snapshot.panes.size > 0 ? 'stale' : 'failed';
      this.setSnapshot({ ...this.snapshot, connection });
      if (
        error instanceof BoardError &&
        (error.code === 'protocol_incompatible' || error.code === 'protocol_malformed')
      )
        throw error;
      throw new BoardError(
        'snapshot_failed',
        `Unable to synchronize Herdr: ${errorMessage(error)}`,
        error,
      );
    }
  }

  /** Resolve current pane IDs from stable board identity immediately before a command. */
  public resolveCurrentTarget(stableAgentId: string): CurrentAgentTarget | undefined {
    const candidates = [...this.snapshot.panes.values()].filter((pane) => {
      const agentId = pane.agentId ?? pane.terminalId ?? pane.id;
      return (
        agentId === stableAgentId || pane.terminalId === stableAgentId || pane.id === stableAgentId
      );
    });
    const pane = candidates.length === 1 ? candidates[0] : undefined;
    if (pane === undefined) return undefined;
    return {
      stableAgentId,
      terminalId: pane.terminalId,
      paneId: pane.id,
      tabId: pane.tabId,
      workspaceId: pane.workspaceId,
    };
  }

  /** Stop event monitoring and release the Herdr transport. */
  public async dispose(): Promise<void> {
    if (this.disposed) {
      await this.monitorPromise?.catch(() => undefined);
      return;
    }
    this.disposed = true;
    this.monitoring = false;
    this.resolveStopped?.();
    await this.transport.close();
    await this.monitorPromise?.catch(() => undefined);
  }

  private async startInternal(): Promise<void> {
    await this.refresh();
    if (this.disposed) return;
    this.monitoring = true;
    this.monitorPromise = this.monitorEvents();
  }

  private async monitorEvents(): Promise<void> {
    let attempt = 0;
    while (this.monitoring && !this.disposed) {
      try {
        const events = await this.transport.subscribe(EVENT_SUBSCRIPTIONS);
        await this.refresh();
        if (!this.monitoring || this.disposed) break;
        attempt = 0;
        for await (const event of events) {
          if (!this.monitoring || this.disposed) break;
          this.applyEvent(event);
        }
        if (!this.monitoring || this.disposed) break;
        this.setSnapshot({ ...this.snapshot, connection: 'stale' });
      } catch (error) {
        if (error instanceof BoardError && error.code === 'events_unavailable') {
          this.setSnapshot({
            ...this.snapshot,
            connection: this.fallbackConnection(this.snapshot.panes.size),
            message: EVENTS_UNAVAILABLE_MESSAGE,
          });
          this.eventStreamUnavailable = true;
          this.monitoring = false;
          return;
        }
        this.setSnapshot({ ...this.snapshot, connection: 'stale' });
      }
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 5_000;
      attempt += 1;
      await Promise.race([wait(delay), this.stopped]);
      if (attempt >= RECONNECT_DELAYS_MS.length) {
        this.setSnapshot({
          ...this.snapshot,
          connection: this.snapshot.panes.size > 0 ? 'stale' : 'failed',
        });
      }
    }
  }

  private applyEvent(event: HerdrEvent): void {
    this.setSnapshot({
      ...applyHerdrEvent(this.snapshot, event),
      connection: 'live',
      lastEventType: event.event,
      lastEventSequence: (this.eventSequence += 1),
      lastSynchronizedAt: this.clock.now(),
    });
  }

  private setSnapshot(snapshot: SessionStoreSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private fallbackConnection(paneCount: number): SessionStoreSnapshot['connection'] {
    return paneCount > 0 ? 'stale' : 'failed';
  }
}

const EVENT_SUBSCRIPTIONS = [
  { type: 'workspace.created' },
  { type: 'workspace.updated' },
  { type: 'workspace.metadata_updated' },
  { type: 'workspace.renamed' },
  { type: 'workspace.moved' },
  { type: 'workspace.closed' },
  { type: 'workspace.focused' },
  { type: 'tab.created' },
  { type: 'tab.closed' },
  { type: 'tab.focused' },
  { type: 'tab.renamed' },
  { type: 'tab.moved' },
  { type: 'pane.created' },
  { type: 'pane.updated' },
  { type: 'pane.closed' },
  { type: 'pane.focused' },
  { type: 'pane.moved' },
  { type: 'pane.exited' },
  { type: 'pane.agent_detected' },
  { type: 'pane.output_matched' },
  { type: 'pane.agent_status_changed' },
  { type: 'pane.scroll_changed' },
  { type: 'layout.updated' },
  { type: 'worktree.created' },
  { type: 'worktree.opened' },
  { type: 'worktree.removed' },
] as const;

function emptySnapshot(): SessionStoreSnapshot {
  return {
    connection: 'connecting',
    workspaces: new Map(),
    tabs: new Map(),
    panes: new Map(),
    agents: new Map<string, AgentRecord>(),
  };
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
