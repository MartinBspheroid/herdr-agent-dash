import type {
  AgentBoardSnapshot,
  AgentBoardStore,
  AgentCard,
  BoardFilter,
  BoardSort,
  Clock,
  StartableSessionStore,
} from '@/contracts';
import type { GitEnricher } from '@/git/git-enricher';
import { AgentProjector } from '@/domain/agent-projector';
import { matchesSearch } from '@/domain/search';
import { needsAttention, sortCards } from '@/domain/attention-sort';

/** Dependencies and policy used to construct the renderer-independent board store. */
export interface AgentBoardStoreOptions {
  readonly session: StartableSessionStore;
  readonly git: GitEnricher;
  readonly projector: AgentProjector;
  readonly clock: Clock;
  readonly defaultSort?: BoardSort;
  readonly watchdogMs?: number;
}

/** Renderer-independent board store combining session, Git, activity, and local UI state. */
export class DefaultAgentBoardStore implements AgentBoardStore {
  private cards: readonly AgentCard[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly stateSince = new Map<string, number>();
  private filter: BoardFilter = 'all';
  private sort: BoardSort;
  private search = '';
  private selectedAgentId: string | undefined;
  private rebuildVersion = 0;
  private unsubscribeSession: (() => void) | undefined;
  private unsubscribeGit: (() => void) | undefined;
  private handledEventSequence = 0;
  private started = false;

  /** Create a board store over public package interfaces only. */
  public constructor(options: AgentBoardStoreOptions) {
    this.session = options.session;
    this.git = options.git;
    this.projector = options.projector;
    this.clock = options.clock;
    this.sort = options.defaultSort ?? 'attention';
    this.watchdogMs = options.watchdogMs ?? 15_000;
  }

  private readonly session: StartableSessionStore;
  private readonly git: GitEnricher;
  private readonly projector: AgentProjector;
  private readonly clock: Clock;
  private readonly watchdogMs: number;

  /** Start the session and first board projection. */
  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.unsubscribeSession = this.session.subscribe(() => void this.rebuild());
    this.unsubscribeGit = this.git.subscribe(() => void this.rebuild());
    await this.session.start();
    await this.rebuild();
  }

  /** Re-snapshot and refresh the board. */
  public async refresh(): Promise<void> {
    await this.session.refresh();
    await this.rebuild();
  }

  /** Return a sorted, filtered immutable UI snapshot. */
  public getSnapshot(): AgentBoardSnapshot {
    const agents = sortCards(this.cards, this.sort);
    const visibleAgents = agents.filter(
      (card) =>
        (this.filter === 'all' || card.state === this.filter) && matchesSearch(card, this.search),
    );
    const sessionSnapshot = this.session.getSnapshot();
    const selected =
      this.selectedAgentId !== undefined &&
      visibleAgents.some((card) => card.id === this.selectedAgentId)
        ? this.selectedAgentId
        : visibleAgents[0]?.id;
    return {
      connection: sessionSnapshot.connection,
      agents,
      visibleAgents,
      selectedAgentId: selected,
      attentionCount: agents.filter(needsAttention).length,
      filter: this.filter,
      sort: this.sort,
      search: this.search,
      generatedAt: this.clock.now(),
      message:
        sessionSnapshot.message ?? connectionMessage(sessionSnapshot.connection, agents.length),
    };
  }

  /** Subscribe to changes from session, Git, activity, or UI state. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Select a stable board identity. */
  public select(id: string): void {
    if (this.cards.some((card) => card.id === id)) {
      this.selectedAgentId = id;
      this.notify();
    }
  }

  /** Move selection through the currently visible rows. */
  public moveSelection(delta: number): void {
    const rows = this.getSnapshot().visibleAgents;
    if (rows.length === 0) return;
    const current = rows.findIndex((card) => card.id === this.selectedAgentId);
    const index = current < 0 ? 0 : (current + delta + rows.length) % rows.length;
    this.selectedAgentId = rows[index]?.id;
    this.notify();
  }

  /** Replace the free-text search query. */
  public setSearch(value: string): void {
    this.search = value.slice(0, 200);
    this.notify();
  }

  /** Replace the state filter. */
  public setFilter(filter: BoardFilter): void {
    this.filter = filter;
    this.notify();
  }

  /** Replace the current ordering. */
  public setSort(sort: BoardSort): void {
    this.sort = sort;
    this.notify();
  }

  /** Mark a completed row as reviewed without changing Herdr's semantic state. */
  public markReviewed(id: string): void {
    this.cards = this.cards.map((card) => (card.id === id ? { ...card, reviewed: true } : card));
    this.notify();
  }

  /** Dispose subscriptions and owned enrichment/session resources. */
  public async dispose(): Promise<void> {
    this.unsubscribeSession?.();
    this.unsubscribeGit?.();
    await this.git.dispose();
    await this.session.dispose();
  }

  private async rebuild(): Promise<void> {
    const version = ++this.rebuildVersion;
    const sessionSnapshot = this.session.getSnapshot();
    const projected = this.projector.project(sessionSnapshot, this.cards);
    if (this.shouldInvalidateGit(sessionSnapshot)) {
      const cwds = new Set([
        ...this.cards
          .map((card) => card.effectiveCwd)
          .filter((cwd): cwd is string => cwd !== undefined),
        ...projected
          .map((card) => card.effectiveCwd)
          .filter((cwd): cwd is string => cwd !== undefined),
      ]);
      for (const cwd of cwds) this.git.invalidate(cwd, 'herdr_event');
    }
    this.cards = this.applyStateTimes(projected);
    this.reconcileSelection();
    this.notify();
    const cwds = [
      ...new Set(
        this.cards
          .map((card) => card.effectiveCwd)
          .filter((cwd): cwd is string => cwd !== undefined),
      ),
    ];
    this.git.startWatchdog?.(cwds, this.watchdogMs);
    await Promise.all(cwds.map(async (cwd) => this.git.ensure(cwd, 'herdr_event')));
    if (version !== this.rebuildVersion) return;
    const enriched = this.projector.project(this.session.getSnapshot(), this.cards);
    const withActivity = await this.projector.enrichActivity(enriched, this.session.getSnapshot());
    if (version !== this.rebuildVersion) return;
    this.cards = this.applyStateTimes(withActivity);
    this.reconcileSelection();
    this.notify();
  }

  private applyStateTimes(cards: readonly AgentCard[]): readonly AgentCard[] {
    return cards.map((card) => {
      const previous = this.cards.find((item) => item.id === card.id);
      if (previous !== undefined && previous.state !== card.state) {
        const stateSince = this.clock.now();
        this.stateSince.set(card.id, stateSince);
        return { ...card, stateSince };
      }
      const stateSince = previous?.stateSince ?? this.stateSince.get(card.id);
      return stateSince === undefined ? card : { ...card, stateSince };
    });
  }

  private reconcileSelection(): void {
    if (
      this.selectedAgentId !== undefined &&
      this.cards.some((card) => card.id === this.selectedAgentId)
    )
      return;
    this.selectedAgentId = sortCards(this.cards, this.sort)[0]?.id;
  }

  private shouldInvalidateGit(snapshot: ReturnType<StartableSessionStore['getSnapshot']>): boolean {
    const sequence = snapshot.lastEventSequence;
    if (sequence === undefined || sequence === this.handledEventSequence) return false;
    this.handledEventSequence = sequence;
    const eventType = snapshot.lastEventType ?? '';
    return (
      eventType === 'pane.updated' ||
      eventType === 'pane.moved' ||
      eventType.startsWith('worktree.')
    );
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function connectionMessage(
  connection: ReturnType<StartableSessionStore['getSnapshot']>['connection'],
  agentCount: number,
): string | undefined {
  if (connection === 'failed') return 'Unable to connect to Herdr; press r to retry';
  if (connection === 'incompatible')
    return 'This Herdr version is incompatible; update Herdr and retry';
  if (connection === 'connecting') return 'Connecting to Herdr…';
  if (connection === 'stale') return 'Showing stale data; reconnecting to Herdr…';
  return agentCount === 0 ? 'No active Herdr agents detected' : undefined;
}
