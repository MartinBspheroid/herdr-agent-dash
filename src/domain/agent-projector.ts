import type {
  ActivityBundle,
  AgentCard,
  AgentRecord,
  AgentState,
  Clock,
  GitContext,
  PaneRecord,
  SessionStoreSnapshot,
} from '@/contracts';
import type { ActivityEngine } from '@/activity/engine';
import type { ActivityContext } from '@/activity/provider';

const EMPTY_ACTIVITY: ActivityBundle = { candidates: [] };
const LOADING_GIT: GitContext = { status: 'loading' };

/** Joins normalized Herdr records into one provider-neutral card per active agent. */
export class AgentProjector {
  /** Create a projector using the Git cache and activity engine as dependencies. */
  public constructor(
    private readonly git: { get(cwd: string): GitContext | undefined },
    private readonly activity: ActivityEngine,
    private readonly clock: Clock,
  ) {}

  /** Produce cards immediately, using cached enrichment and empty activity when needed. */
  public project(
    snapshot: SessionStoreSnapshot,
    previous: readonly AgentCard[] = [],
  ): readonly AgentCard[] {
    const previousById = new Map(previous.map((card) => [card.id, card]));
    const panesByIdentity = indexPanes(snapshot);
    const cards: AgentCard[] = [];
    const seenIds = new Set<string>();
    for (const agent of snapshot.agents.values()) {
      const pane = findPane(panesByIdentity, agent);
      const id = stableIdentity(agent, pane);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const previousCard = previousById.get(id);
      const effectiveCwd = pane?.foregroundCwd ?? pane?.cwd;
      cards.push({
        id,
        terminalId: pane?.terminalId,
        paneId: pane?.id,
        tabId: pane?.tabId,
        workspaceId: pane?.workspaceId,
        agent: agent.name,
        displayName: pane?.provider === undefined ? agent.name : `${pane.provider} · ${agent.name}`,
        provider: pane?.provider ?? agent.provider,
        nativeSession: pane?.agentSession ?? agent.session,
        state: normalizeState(pane?.agentStatus ?? agent.status),
        rawState: pane?.agentStatus ?? agent.status,
        stateSince:
          previousCard?.state === normalizeState(pane?.agentStatus ?? agent.status)
            ? previousCard.stateSince
            : undefined,
        lastHostEventAt: previousCard?.lastHostEventAt,
        focused: pane?.focused ?? false,
        reviewed: previousCard?.reviewed ?? false,
        workspaceLabel:
          pane === undefined ? undefined : snapshot.workspaces.get(pane.workspaceId)?.label,
        tabLabel: pane === undefined ? undefined : snapshot.tabs.get(pane.tabId)?.label,
        paneLabel: pane?.id,
        cwd: pane?.cwd,
        foregroundCwd: pane?.foregroundCwd,
        effectiveCwd,
        git: effectiveCwd === undefined ? LOADING_GIT : (this.git.get(effectiveCwd) ?? LOADING_GIT),
        activity: EMPTY_ACTIVITY,
        connection:
          snapshot.connection === 'live'
            ? 'live'
            : snapshot.connection === 'stale'
              ? 'stale'
              : 'unavailable',
        revision: pane?.revision ?? agent.revision,
      });
    }
    return cards;
  }

  /** Fill activity asynchronously while preserving the card identity and Git evidence. */
  public async enrichActivity(
    cards: readonly AgentCard[],
    snapshot: SessionStoreSnapshot,
  ): Promise<readonly AgentCard[]> {
    const panesByIdentity = indexPanes(snapshot);
    const agentsByCardId = new Map<string, AgentRecord>();
    for (const agent of snapshot.agents.values()) {
      agentsByCardId.set(stableIdentity(agent, findPane(panesByIdentity, agent)), agent);
    }
    const enriched: AgentCard[] = [];
    for (const card of cards) {
      const agent = agentsByCardId.get(card.id);
      const pane = card.paneId === undefined ? undefined : snapshot.panes.get(card.paneId);
      if (agent === undefined) {
        enriched.push(card);
        continue;
      }
      const context: ActivityContext = { agent, pane, git: card.git, observedAt: this.clock.now() };
      const activity = await this.activity.collect(context);
      enriched.push({
        ...card,
        activity:
          card.connection === 'live'
            ? activity
            : {
                ...activity,
                candidates: activity.candidates.map((signal) => ({ ...signal, stale: true })),
                currentSignal:
                  activity.currentSignal === undefined
                    ? undefined
                    : { ...activity.currentSignal, stale: true },
                lastRequest:
                  activity.lastRequest === undefined
                    ? undefined
                    : { ...activity.lastRequest, stale: true },
                recentOutput:
                  activity.recentOutput === undefined
                    ? undefined
                    : { ...activity.recentOutput, stale: true },
                repositoryChange:
                  activity.repositoryChange === undefined
                    ? undefined
                    : { ...activity.repositoryChange, stale: true },
              },
      });
    }
    return enriched;
  }
}

function indexPanes(snapshot: SessionStoreSnapshot): ReadonlyMap<string, PaneRecord> {
  const result = new Map<string, PaneRecord>();
  for (const pane of snapshot.panes.values()) {
    result.set(pane.id, pane);
    if (pane.agentId !== undefined) result.set(pane.agentId, pane);
    if (pane.terminalId !== undefined) result.set(pane.terminalId, pane);
  }
  return result;
}

function findPane(
  panesByIdentity: ReadonlyMap<string, PaneRecord>,
  agent: AgentRecord,
): PaneRecord | undefined {
  return panesByIdentity.get(agent.id);
}

function stableIdentity(agent: AgentRecord, pane: PaneRecord | undefined): string {
  if (pane?.terminalId !== undefined) return pane.terminalId;
  if (agent.session !== undefined) return `${agent.session.source}:${agent.session.value}`;
  if (pane?.agentSession !== undefined)
    return `${pane.agentSession.source}:${pane.agentSession.value}`;
  return pane?.id ?? agent.id;
}

function normalizeState(raw: string | undefined): AgentState {
  switch (raw?.toLowerCase()) {
    case 'blocked':
      return 'blocked';
    case 'done':
    case 'completed':
      return 'done';
    case 'working':
    case 'running':
      return 'working';
    case 'idle':
      return 'idle';
    default:
      return 'unknown';
  }
}
