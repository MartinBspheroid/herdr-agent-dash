import type { SessionStoreSnapshot } from '@/contracts';

/** Remove a closed workspace and all normalized descendants from the cache. */
export function removeWorkspace(
  snapshot: SessionStoreSnapshot,
  payload: Record<string, unknown>,
): SessionStoreSnapshot {
  const workspace = asRecord(payload.workspace);
  const workspaceId =
    stringValue(payload.workspace_id) ??
    stringValue(payload.workspaceId) ??
    stringValue(workspace?.id) ??
    stringValue(workspace?.workspace_id);
  if (workspaceId === undefined) return snapshot;
  const workspaces = new Map(snapshot.workspaces);
  const tabs = new Map([...snapshot.tabs].filter(([, tab]) => tab.workspaceId !== workspaceId));
  const panes = new Map([...snapshot.panes].filter(([, pane]) => pane.workspaceId !== workspaceId));
  workspaces.delete(workspaceId);
  return removeAgentsForPanes({ ...snapshot, workspaces, tabs, panes });
}

/** Drop agent records no longer represented by any retained pane. */
export function removeAgentsForPanes(snapshot: SessionStoreSnapshot): SessionStoreSnapshot {
  const agents = new Map(snapshot.agents);
  for (const agent of agents.values()) {
    const stillPresent = [...snapshot.panes.values()].some(
      (pane) => (pane.agentId ?? pane.terminalId ?? pane.id) === agent.id,
    );
    if (!stillPresent) agents.delete(agent.id);
  }
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
