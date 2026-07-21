import type {
  AgentCard,
  AgentRecord,
  AgentState,
  ConnectionState,
  PaneRecord,
  TabRecord,
  WorkspaceRecord,
} from '@/contracts/types';

/** A complete cached session state, safe to expose to domain code. */
export interface SessionStoreSnapshot {
  readonly connection: ConnectionState;
  readonly message?: string | undefined;
  readonly lastEventType?: string | undefined;
  readonly lastEventSequence?: number | undefined;
  readonly serverVersion?: string | undefined;
  readonly protocolVersion?: number | undefined;
  readonly workspaces: ReadonlyMap<string, WorkspaceRecord>;
  readonly tabs: ReadonlyMap<string, TabRecord>;
  readonly panes: ReadonlyMap<string, PaneRecord>;
  readonly agents: ReadonlyMap<string, AgentRecord>;
  readonly lastSynchronizedAt?: number | undefined;
}

/** Live normalized session cache used by projection and command services. */
export interface SessionStore {
  getSnapshot(): SessionStoreSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  resolveCurrentTarget(stableAgentId: string): CurrentAgentTarget | undefined;
  dispose(): Promise<void>;
}

/** Session-store variant used by the application bootstrap to start live monitoring. */
export interface StartableSessionStore extends SessionStore {
  start(): Promise<void>;
}

/** The current target IDs needed for a focus or read operation. */
export interface CurrentAgentTarget {
  readonly stableAgentId: string;
  readonly terminalId?: string | undefined;
  readonly paneId: string;
  readonly tabId: string;
  readonly workspaceId: string;
}

/** A minimal socket/CLI transport shared by live and fake clients. */
export interface HerdrTransport {
  request<T>(method: string, params?: unknown): Promise<T>;
  subscribe(subscriptions: readonly EventSubscription[]): Promise<HerdrEventStream>;
  close(): Promise<void>;
  getDiagnostics?(): TransportDiagnostics;
}

/** A closeable long-lived event stream owned by its transport. */
export interface HerdrEventStream extends AsyncIterable<HerdrEvent> {
  close(): void;
}

/** In-memory transport health counters safe to expose to diagnostics. */
export interface TransportDiagnostics {
  readonly connected: boolean;
  readonly pendingRequests: number;
  readonly queuedEvents: number;
  readonly requestCount: number;
  readonly timeoutCount: number;
  readonly malformedCount: number;
  readonly frameLimitCount: number;
  readonly queueOverflowCount: number;
  readonly disconnectCount: number;
  readonly lastError?: string | undefined;
}

/** One event family requested from Herdr. */
export interface EventSubscription {
  readonly type: string;
  readonly pane_id?: string | undefined;
  readonly tab_id?: string | undefined;
  readonly workspace_id?: string | undefined;
  readonly agent_status?: string | undefined;
}

/** A normalized event envelope with an opaque payload for forward compatibility. */
export interface HerdrEvent {
  readonly event: string;
  readonly payload: unknown;
  readonly revision?: number | undefined;
}

/** Injectable process execution boundary for Git and Herdr CLI operations. */
export interface ProcessRunner {
  run(argv: readonly string[], options?: ProcessOptions): Promise<ProcessResult>;
}

/** Bounded process execution options. */
export interface ProcessOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Process result with explicit timeout and bounded output state. */
export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal?: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

/** Injectable wall-clock source for deterministic state-age tests. */
export interface Clock {
  now(): number;
}

/** Current board filtering mode. */
export type BoardFilter = 'all' | AgentState;

/** Current board ordering mode. */
export type BoardSort =
  'attention' | 'state' | 'workspace' | 'repository' | 'branch' | 'agent' | 'recent';

/** Renderer-facing board snapshot. */
export interface AgentBoardSnapshot {
  readonly connection: ConnectionState;
  readonly agents: readonly AgentCard[];
  readonly visibleAgents: readonly AgentCard[];
  readonly selectedAgentId?: string | undefined;
  readonly attentionCount: number;
  readonly filter: BoardFilter;
  readonly sort: BoardSort;
  readonly search: string;
  readonly generatedAt: number;
  readonly message?: string | undefined;
}

/** Domain store consumed by the UI without transport or process access. */
export interface AgentBoardStore {
  getSnapshot(): AgentBoardSnapshot;
  subscribe(listener: () => void): () => void;
  select(id: string): void;
  moveSelection(delta: number): void;
  setSearch(value: string): void;
  setFilter(filter: BoardFilter): void;
  setSort(sort: BoardSort): void;
  markReviewed(id: string): void;
}

/** A bounded preview returned only after an explicit output request. */
export interface OutputPreview {
  readonly text: string;
  readonly lines: number;
  readonly bytes: number;
  readonly truncated: boolean;
}

/** Structured result returned by user commands. */
export interface CommandResult<T = undefined> {
  readonly ok: boolean;
  readonly message: string;
  readonly value?: T | undefined;
}

/** Actions exposed by the board UI. */
export interface CommandService {
  focusAgent(stableAgentId: string): Promise<CommandResult>;
  refreshAll(): Promise<CommandResult>;
  refreshGit(stableAgentId: string): Promise<CommandResult>;
  loadRecentOutput(stableAgentId: string): Promise<CommandResult<OutputPreview>>;
  close(): Promise<void>;
}
