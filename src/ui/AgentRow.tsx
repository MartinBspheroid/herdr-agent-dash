import type { ReactNode } from 'react';

import type { AgentCard } from '@/contracts';
import { compactPath, truncateText } from '@/safety/bounded-text';
import { sanitizeTerminalText } from '@/safety/sanitize-terminal';

/** Default row columns used when configuration is absent or invalid. */
export const DEFAULT_VISIBLE_COLUMNS = [
  'state',
  'agent',
  'location',
  'signal',
  'repository',
  'branch',
] as const;

/** Render one compact, text-labelled agent row for keyboard scanning. */
export function AgentRow({
  card,
  selected,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS,
  compactPathSegments = 3,
}: {
  readonly card: AgentCard;
  readonly selected: boolean;
  readonly visibleColumns?: readonly string[];
  readonly compactPathSegments?: number;
}): ReactNode {
  const state = card.state.toUpperCase().padEnd(7, ' ');
  const signal = safeDisplay(
    `${card.activity.currentSignal?.text ?? 'No reported activity'}${card.activity.currentSignal?.stale ? ' · stale' : ''}`,
    256,
  );
  const repository = safeDisplay(card.git.repoName ?? formatRepositoryStatus(card.git), 256);
  const branch = safeDisplay(card.git.branch ?? card.git.detachedHead ?? '—', 256);
  const location = [card.workspaceLabel, card.tabLabel, card.paneLabel]
    .filter((value): value is string => value !== undefined)
    .map((value) => safeDisplay(value, 128))
    .join('/');
  const prefix = selected ? '▸' : ' ';
  const marker =
    card.state === 'blocked'
      ? '!'
      : card.state === 'done'
        ? '✓'
        : card.state === 'working'
          ? '●'
          : card.state === 'idle'
            ? '○'
            : '?';
  const values: Readonly<Record<string, string>> = {
    state,
    agent: truncateText(safeDisplay(card.displayName, 256), 18),
    location: truncateText(location || '—', 22),
    signal: truncateText(signal, 34),
    repository: truncateText(repository, 18),
    branch: truncateText(branch, 24),
    cwd: compactPath(safeDisplay(card.effectiveCwd ?? '—', 512), compactPathSegments ?? 3),
  };
  const columns = visibleColumns
    .map((column) => ({ column, value: values[column] ?? '' }))
    .filter(({ value }) => value.length > 0);
  const stateColor = stateColorFor(card.state);
  return (
    <text
      fg={selected ? '#ffffff' : card.state === 'blocked' ? '#ff6b6b' : '#c7d2e0'}
      wrapMode="none"
      truncate
    >
      {`${prefix} `}
      {columns.map(({ column, value }, index) => (
        <span key={`${column}-${index}`}>
          {index > 0 ? '  ' : null}
          {column === 'state' ? (
            <>
              <span fg={stateColor}>{marker}</span>
              {` ${value}`}
            </>
          ) : (
            value
          )}
        </span>
      ))}
    </text>
  );
}

function stateColorFor(state: AgentCard['state']): string {
  switch (state) {
    case 'blocked':
      return '#ff6b6b';
    case 'done':
      return '#50fa7b';
    case 'working':
      return '#8be9fd';
    case 'idle':
      return '#9aa7b6';
    case 'unknown':
      return '#ffb86c';
  }
}

function safeDisplay(value: string, maxBytes: number): string {
  return sanitizeTerminalText(value, maxBytes).text;
}

function formatRepositoryStatus(git: AgentCard['git']): string {
  switch (git.status) {
    case 'not_git':
      return 'not a Git repository';
    case 'loading':
      return 'Git loading';
    case 'stale':
      return 'Git stale';
    case 'error':
      return `Git error (${git.errorCode ?? 'unknown'})`;
    case 'ready':
      return 'Git repository';
  }
}
