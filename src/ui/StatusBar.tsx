import type { ReactNode } from 'react';

import type { AgentBoardSnapshot, ConnectionState } from '@/contracts';

/** Render health, freshness, filter, and keyboard help without relying on color. */
export function StatusBar({
  snapshot,
  notice,
}: {
  readonly snapshot: AgentBoardSnapshot;
  readonly notice: string | undefined;
}): ReactNode {
  const health = connectionLabel(snapshot.connection);
  const visibleNotice = shouldShowNotice(snapshot.connection, notice) ? notice : undefined;
  return (
    <box flexDirection="column">
      <text fg={snapshot.connection === 'live' ? '#50fa7b' : '#ffb86c'}>
        {`Herdr Agent Board · ${snapshot.agents.length} ${snapshot.agents.length === 1 ? 'agent' : 'agents'} · ${snapshot.attentionCount} need attention · ${health}`}
      </text>
      <text fg="#9aa7b6">{`/ ${snapshot.search || 'search'}   filter: ${formatFilter(snapshot.filter)}   sort: ${formatSort(snapshot.sort)}   ↑↓ select · Enter focus · ? help`}</text>
      {visibleNotice === undefined ? null : <text fg="#f1fa8c">{visibleNotice}</text>}
      {snapshot.message === undefined || snapshot.message === visibleNotice ? null : (
        <text fg="#ffb86c">{snapshot.message}</text>
      )}
    </box>
  );
}

function shouldShowNotice(connection: ConnectionState, notice: string | undefined): boolean {
  if (notice === undefined) return false;
  if (connection === 'live' || connection === 'stale') return !isTransportNotice(notice);
  return true;
}

function isTransportNotice(notice: string): boolean {
  return /\b(?:socket|transport|connection|reconnect)\b/i.test(notice);
}

function formatFilter(filter: AgentBoardSnapshot['filter']): string {
  return filter === 'all' ? 'all states' : filter;
}

function formatSort(sort: AgentBoardSnapshot['sort']): string {
  return sort === 'recent' ? 'recent activity' : sort;
}

function connectionLabel(connection: ConnectionState): string {
  switch (connection) {
    case 'live':
      return 'LIVE';
    case 'connecting':
      return 'CONNECTING';
    case 'stale':
      return 'STALE — reconnecting';
    case 'failed':
      return 'FAILED — retry with r';
    case 'incompatible':
      return 'INCOMPATIBLE — update Herdr';
  }
}
