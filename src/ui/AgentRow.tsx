import type { ReactNode } from 'react';

import type { AgentCard } from '@/contracts';
import { compactPath, truncateText } from '@/safety/bounded-text';
import { sanitizeTerminalText } from '@/safety/sanitize-terminal';
import type { BoardLayout } from '@/ui/layout';
import { tableColumns, type TableColumnSpec } from '@/ui/table-layout';
import { BOARD_COLORS, stateColor } from '@/ui/theme';

/** Default row columns used when configuration is absent or invalid. */
export const DEFAULT_VISIBLE_COLUMNS = [
  'state',
  'agent',
  'location',
  'signal',
  'repository',
  'branch',
] as const;

/** Return the stable OpenTUI renderable id used for scroll-to-selection behavior. */
export function agentRowId(cardId: string): string {
  return `agent-row-${cardId}`;
}

/** Render one fixed-column agent row with bounded single-line cells. */
export function AgentRow({
  card,
  selected,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS,
  compactPathSegments = 3,
  layout = 'wide',
}: {
  readonly card: AgentCard;
  readonly selected: boolean;
  readonly visibleColumns?: readonly string[];
  readonly compactPathSegments?: number;
  readonly layout?: BoardLayout;
}): ReactNode {
  const columns = tableColumns(visibleColumns, layout);
  const values = rowValues(card, compactPathSegments);
  const foreground = selected ? BOARD_COLORS.text : BOARD_COLORS.textMuted;
  return (
    <box
      id={agentRowId(card.id)}
      width="100%"
      height={1}
      flexDirection="row"
      flexShrink={0}
      overflow="hidden"
      backgroundColor={selected ? BOARD_COLORS.selected : BOARD_COLORS.panel}
    >
      {columns.map((column) => (
        <TableCell
          key={column.key}
          column={column}
          value={values[column.key] ?? '—'}
          foreground={foreground}
          card={card}
        />
      ))}
    </box>
  );
}

function TableCell({
  column,
  value,
  foreground,
  card,
}: {
  readonly column: TableColumnSpec;
  readonly value: string;
  readonly foreground: string;
  readonly card: AgentCard;
}): ReactNode {
  const layout = column.flexible
    ? { flexGrow: 1, flexBasis: 0, minWidth: column.width }
    : {
        width: column.width,
        minWidth: column.width,
        maxWidth: column.width,
        flexShrink: 0,
      };
  if (column.key === 'state') {
    const color = stateColor(card.state);
    return (
      <box flexDirection="row" paddingLeft={1} overflow="hidden" {...layout}>
        <text fg={color} wrapMode="none">
          ●
        </text>
        <text fg={color} wrapMode="none" truncate>
          {` ${value}`}
        </text>
      </box>
    );
  }
  const cellColor =
    column.key === 'signal' && card.state === 'unknown' ? BOARD_COLORS.amber : foreground;
  return (
    <box paddingLeft={1} overflow="hidden" {...layout}>
      <text fg={cellColor} width="100%" wrapMode="none" truncate>
        {value}
      </text>
    </box>
  );
}

function rowValues(card: AgentCard, compactPathSegments: number): Readonly<Record<string, string>> {
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
  return {
    state: card.state.toUpperCase(),
    agent: truncateText(safeDisplay(card.displayName, 256), 32),
    location: truncateText(location || '—', 48),
    signal: truncateText(signal, 80),
    repository: truncateText(repository, 36),
    branch: truncateText(branch, 52),
    cwd: compactPath(safeDisplay(card.effectiveCwd ?? '—', 512), compactPathSegments),
  };
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
