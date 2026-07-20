import type { AgentRecord, HerdrEvent, PaneRecord, SessionStoreSnapshot } from '@/contracts';
import { removeAgentsForPanes, removeWorkspace } from '@/herdr/event-reducer-cleanup';
import { normalizePane, normalizeSnapshot } from '@/herdr/protocol';

/** Apply one normalized Herdr event without allowing a malformed record to poison the cache. */
export function applyHerdrEvent(
  snapshot: SessionStoreSnapshot,
  event: HerdrEvent,
): SessionStoreSnapshot {
  if (event.event === 'session.snapshot') {
    return normalizeSnapshot(event.payload, snapshot.connection);
  }
  const payload = asRecord(event.payload);
  if (payload === undefined) return snapshot;
  if (event.event.startsWith('pane.'))
    return applyPaneEvent(snapshot, event.event, payload, event.revision);
  if (event.event.startsWith('workspace.'))
    return event.event === 'workspace.closed'
      ? removeWorkspace(snapshot, payload)
      : applyWorkspaceUpdate(snapshot, payload);
  if (event.event.startsWith('tab.')) return applyTabEvent(snapshot, event.event, payload);
  return snapshot;
}

function applyPaneEvent(
  snapshot: SessionStoreSnapshot,
  name: string,
  payload: Record<string, unknown>,
  revision?: number,
): SessionStoreSnapshot {
  const paneValue = payload.pane ?? payload;
  const paneId =
    stringValue(payload.pane_id) ??
    stringValue(payload.paneId) ??
    stringValue(asRecord(paneValue)?.id) ??
    stringValue(asRecord(paneValue)?.pane_id) ??
    stringValue(asRecord(paneValue)?.paneId);
  if (paneId === undefined) return snapshot;
  const panes = new Map(snapshot.panes);
  const existing = panes.get(paneId);
  const incomingRevision =
    revision ?? eventRevisionFromPayload(payload) ?? eventRevisionFromValue(paneValue);
  if (eventRevisionIsStale(incomingRevision, existing?.revision)) return snapshot;
  if (name === 'pane.closed' || name === 'pane.exited') {
    panes.delete(paneId);
    return removeAgentForPane({ ...snapshot, panes }, existing);
  }
  const normalized = normalizePane(withExistingDefaults(paneValue, existing), paneId);
  if (normalized === undefined && existing === undefined) return snapshot;
  const merged = normalized === undefined ? existing : mergePane(existing, normalized);
  if (merged === undefined) return snapshot;
  for (const [oldPaneId, oldPane] of panes.entries()) {
    if (
      oldPaneId !== paneId &&
      merged.terminalId !== undefined &&
      oldPane.terminalId === merged.terminalId
    )
      panes.delete(oldPaneId);
  }
  panes.set(
    paneId,
    incomingRevision === undefined || merged.revision !== undefined
      ? merged
      : { ...merged, revision: incomingRevision },
  );
  const agents = removeOrphanAgents(upsertAgentFromPane(new Map(snapshot.agents), merged), panes);
  return { ...snapshot, panes, agents };
}

function applyWorkspaceUpdate(
  snapshot: SessionStoreSnapshot,
  payload: Record<string, unknown>,
): SessionStoreSnapshot {
  const value = payload.workspace ?? payload;
  const workspaceId =
    stringValue(payload.workspace_id) ??
    stringValue(payload.workspaceId) ??
    stringValue(asRecord(value)?.id);
  if (workspaceId === undefined) return snapshot;
  const workspace = snapshot.workspaces.get(workspaceId);
  const record = asRecord(value);
  if (record === undefined && workspace === undefined) return snapshot;
  const next =
    record === undefined
      ? workspace
      : {
          id: workspaceId,
          label:
            stringValue(record.label) ??
            stringValue(record.name) ??
            workspace?.label ??
            workspaceId,
          cwd: stringValue(record.cwd) ?? workspace?.cwd,
          revision: numberValue(record.revision) ?? workspace?.revision,
        };
  if (next === undefined) return snapshot;
  if (eventRevisionIsStale(next.revision, workspace?.revision)) return snapshot;
  const workspaces = new Map(snapshot.workspaces);
  workspaces.set(workspaceId, next);
  return { ...snapshot, workspaces };
}

function applyTabEvent(
  snapshot: SessionStoreSnapshot,
  name: string,
  payload: Record<string, unknown>,
): SessionStoreSnapshot {
  const tabValue = payload.tab ?? payload;
  const tabId =
    stringValue(payload.tab_id) ??
    stringValue(payload.tabId) ??
    stringValue(asRecord(tabValue)?.id);
  if (tabId === undefined) return snapshot;
  const tabs = new Map(snapshot.tabs);
  if (name === 'tab.closed' || name === 'tab.exited') {
    tabs.delete(tabId);
    const panes = new Map([...snapshot.panes].filter(([, pane]) => pane.tabId !== tabId));
    return removeAgentsForPanes({ ...snapshot, tabs, panes });
  }
  const record = asRecord(tabValue);
  const existing = tabs.get(tabId);
  const workspaceId =
    stringValue(record?.workspace_id) ?? stringValue(record?.workspaceId) ?? existing?.workspaceId;
  if (workspaceId === undefined) return snapshot;
  const revision = numberValue(record?.revision);
  if (eventRevisionIsStale(revision, existing?.revision)) return snapshot;
  tabs.set(tabId, {
    id: tabId,
    workspaceId,
    label: stringValue(record?.label) ?? stringValue(record?.name) ?? existing?.label ?? tabId,
    revision: revision ?? existing?.revision,
  });
  return { ...snapshot, tabs };
}

function mergePane(existing: PaneRecord | undefined, next: PaneRecord): PaneRecord {
  if (existing === undefined) return next;
  return {
    ...existing,
    ...next,
    terminalId: next.terminalId ?? existing.terminalId,
    agentId: next.agentId ?? existing.agentId,
    agent: next.agent ?? existing.agent,
    provider: next.provider ?? existing.provider,
    agentSession: next.agentSession ?? existing.agentSession,
    agentStatus: next.agentStatus ?? existing.agentStatus,
    cwd: next.cwd ?? existing.cwd,
    foregroundCwd: next.foregroundCwd ?? existing.foregroundCwd,
    terminalTitle: next.terminalTitle ?? existing.terminalTitle,
    terminalTitleStripped: next.terminalTitleStripped ?? existing.terminalTitleStripped,
    metadata: Object.keys(next.metadata).length === 0 ? existing.metadata : next.metadata,
  };
}

function withExistingDefaults(value: unknown, existing: PaneRecord | undefined): unknown {
  const record = asRecord(value);
  if (record === undefined || existing === undefined) return value;
  return {
    ...record,
    id: record.id ?? record.pane_id ?? record.paneId ?? existing.id,
    tab_id: record.tab_id ?? record.tabId ?? existing.tabId,
    workspace_id: record.workspace_id ?? record.workspaceId ?? existing.workspaceId,
    terminal_id: record.terminal_id ?? record.terminalId ?? existing.terminalId,
    agent_id: record.agent_id ?? record.agentId ?? existing.agentId,
    agent: record.agent ?? existing.agent,
    provider: record.provider ?? existing.provider,
    agent_status: record.agent_status ?? record.agentStatus ?? existing.agentStatus,
    agent_session: record.agent_session ?? record.agentSession ?? existing.agentSession,
    cwd: record.cwd ?? existing.cwd,
    foreground_cwd: record.foreground_cwd ?? record.foregroundCwd ?? existing.foregroundCwd,
    terminal_title: record.terminal_title ?? record.terminalTitle ?? existing.terminalTitle,
    terminal_title_stripped:
      record.terminal_title_stripped ??
      record.terminalTitleStripped ??
      existing.terminalTitleStripped,
    metadata: record.metadata ?? record.presentation ?? record.tokens ?? existing.metadata,
    focused: record.focused ?? existing.focused,
  };
}

function upsertAgentFromPane(
  agents: Map<string, AgentRecord>,
  pane: PaneRecord,
): Map<string, AgentRecord> {
  const id = pane.agentId ?? pane.terminalId ?? pane.id;
  const existing = agents.get(id);
  agents.set(id, {
    id,
    name: pane.agent ?? existing?.name ?? id,
    provider: pane.provider ?? existing?.provider,
    status: pane.agentStatus ?? existing?.status,
    session: pane.agentSession ?? existing?.session,
    revision: pane.revision ?? existing?.revision,
  });
  return agents;
}

function removeOrphanAgents(
  agents: Map<string, AgentRecord>,
  panes: ReadonlyMap<string, PaneRecord>,
): Map<string, AgentRecord> {
  const liveAgentIds = new Set(
    [...panes.values()].map((pane) => pane.agentId ?? pane.terminalId ?? pane.id),
  );
  for (const agentId of agents.keys()) {
    if (!liveAgentIds.has(agentId)) agents.delete(agentId);
  }
  return agents;
}

function removeAgentForPane(
  snapshot: SessionStoreSnapshot,
  pane: PaneRecord | undefined,
): SessionStoreSnapshot {
  if (pane === undefined) return snapshot;
  const agentId = pane.agentId ?? pane.terminalId ?? pane.id;
  const stillPresent = [...snapshot.panes.values()].some(
    (item) => (item.agentId ?? item.terminalId ?? item.id) === agentId,
  );
  if (stillPresent) return snapshot;
  const agents = new Map(snapshot.agents);
  agents.delete(agentId);
  return { ...snapshot, agents };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function eventRevisionFromPayload(payload: Record<string, unknown>): number | undefined {
  return numberValue(payload.revision);
}

function eventRevisionFromValue(value: unknown): number | undefined {
  return numberValue(asRecord(value)?.revision);
}

function eventRevisionIsStale(revision: number | undefined, current: number | undefined): boolean {
  return revision !== undefined && current !== undefined && revision <= current;
}
