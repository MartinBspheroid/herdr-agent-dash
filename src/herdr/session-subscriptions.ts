import type { EventSubscription, SessionStoreSnapshot } from '@/contracts';

const LIFECYCLE_SUBSCRIPTIONS = [
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
  { type: 'layout.updated' },
  { type: 'worktree.created' },
  { type: 'worktree.opened' },
  { type: 'worktree.removed' },
] as const satisfies readonly EventSubscription[];

const TOPOLOGY_EVENTS: ReadonlySet<string> = new Set([
  'workspace.closed',
  'tab.closed',
  'pane.created',
  'pane.closed',
  'pane.moved',
]);

/** Build valid global lifecycle and pane-scoped status subscriptions. */
export function sessionSubscriptions(snapshot: SessionStoreSnapshot): readonly EventSubscription[] {
  return [
    ...LIFECYCLE_SUBSCRIPTIONS,
    ...[...snapshot.panes.keys()].map((paneId) => ({
      type: 'pane.agent_status_changed',
      pane_id: paneId,
    })),
  ];
}

/** Return whether a topology event requires rebuilding pane-scoped subscriptions. */
export function requiresSubscriptionRebuild(eventName: string): boolean {
  return TOPOLOGY_EVENTS.has(eventName);
}
