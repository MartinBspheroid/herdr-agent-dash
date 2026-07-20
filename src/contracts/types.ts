/** Canonical semantic states exposed by the board. */
export type AgentState = 'blocked' | 'done' | 'working' | 'idle' | 'unknown';

/** Connection health for a live board or one of its cached rows. */
export type ConnectionState = 'connecting' | 'live' | 'stale' | 'failed' | 'incompatible';

/** A source category for activity evidence. */
export type ActivitySource =
  | 'reported_metadata'
  | 'reported_state_message'
  | 'terminal_title'
  | 'native_session'
  | 'terminal_output'
  | 'none';

/** The meaning a consumer may safely assign to an activity signal. */
export type ActivitySemantics =
  'current_signal' | 'last_request' | 'raw_output' | 'repository_change';

/** How directly the source supports its displayed meaning. */
export type ActivityConfidence = 'explicit' | 'derived' | 'raw' | 'unknown';

/** Evidence shown in the table or detail view. */
export interface ActivitySignal {
  readonly text: string;
  readonly source: ActivitySource;
  readonly semantics: ActivitySemantics;
  readonly confidence: ActivityConfidence;
  readonly observedAt?: number | undefined;
  readonly sourceLabel: string;
  readonly stale: boolean;
}

/** Git state associated with one repository/worktree identity. */
export interface GitContext {
  readonly status: 'loading' | 'ready' | 'not_git' | 'stale' | 'error';
  readonly repoRoot?: string | undefined;
  readonly repoName?: string | undefined;
  readonly worktreePath?: string | undefined;
  readonly branch?: string | undefined;
  readonly detachedHead?: string | undefined;
  readonly clean?: boolean | undefined;
  readonly changedFiles?: number | undefined;
  readonly staged?: number | undefined;
  readonly modified?: number | undefined;
  readonly deleted?: number | undefined;
  readonly renamed?: number | undefined;
  readonly conflicted?: number | undefined;
  readonly untracked?: number | undefined;
  readonly upstream?: string | undefined;
  readonly ahead?: number | undefined;
  readonly behind?: number | undefined;
  readonly insertions?: number | undefined;
  readonly deletions?: number | undefined;
  readonly refreshedAt?: number | undefined;
  readonly errorCode?: string | undefined;
}

/** Evidence candidates collected for an agent. */
export interface ActivityBundle {
  readonly currentSignal?: ActivitySignal | undefined;
  readonly lastRequest?: ActivitySignal | undefined;
  readonly recentOutput?: ActivitySignal | undefined;
  readonly repositoryChange?: ActivitySignal | undefined;
  readonly candidates: readonly ActivitySignal[];
}

/** A normalized agent row independent from Herdr transport details. */
export interface AgentCard {
  readonly id: string;
  readonly terminalId?: string | undefined;
  readonly paneId?: string | undefined;
  readonly tabId?: string | undefined;
  readonly workspaceId?: string | undefined;
  readonly agent: string;
  readonly displayName: string;
  readonly provider?: string | undefined;
  readonly nativeSession?:
    | {
        readonly source: string;
        readonly agent: string;
        readonly kind: string;
        readonly value: string;
      }
    | undefined;
  readonly state: AgentState;
  readonly rawState?: string | undefined;
  readonly stateSince?: number | undefined;
  readonly lastHostEventAt?: number | undefined;
  readonly focused: boolean;
  readonly reviewed: boolean;
  readonly workspaceLabel?: string | undefined;
  readonly tabLabel?: string | undefined;
  readonly paneLabel?: string | undefined;
  readonly cwd?: string | undefined;
  readonly foregroundCwd?: string | undefined;
  readonly effectiveCwd?: string | undefined;
  readonly git: GitContext;
  readonly activity: ActivityBundle;
  readonly connection: 'live' | 'stale' | 'unavailable';
  readonly revision?: number | undefined;
}

/** The minimum normalized workspace record needed by the board. */
export interface WorkspaceRecord {
  readonly id: string;
  readonly label: string;
  readonly cwd?: string | undefined;
  readonly revision?: number | undefined;
}

/** The minimum normalized tab record needed by the board. */
export interface TabRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly revision?: number | undefined;
}

/** The minimum normalized pane record needed by the board. */
export interface PaneRecord {
  readonly id: string;
  readonly terminalId?: string | undefined;
  readonly tabId: string;
  readonly workspaceId: string;
  readonly agentId?: string | undefined;
  readonly agent?: string | undefined;
  readonly provider?: string | undefined;
  readonly agentSession?: NativeSession | undefined;
  readonly agentStatus?: string | undefined;
  readonly cwd?: string | undefined;
  readonly foregroundCwd?: string | undefined;
  readonly terminalTitle?: string | undefined;
  readonly terminalTitleStripped?: string | undefined;
  readonly metadata: Readonly<Record<string, string>>;
  readonly focused: boolean;
  readonly revision?: number | undefined;
}

/** A native provider session reference from Herdr. */
export interface NativeSession {
  readonly source: string;
  readonly agent: string;
  readonly kind: string;
  readonly value: string;
}

/** The minimum normalized agent record needed by the board. */
export interface AgentRecord {
  readonly id: string;
  readonly name: string;
  readonly provider?: string | undefined;
  readonly status?: string | undefined;
  readonly session?: NativeSession | undefined;
  readonly revision?: number | undefined;
}
