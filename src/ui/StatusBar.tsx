import type { ReactNode } from 'react';

import type { AgentBoardSnapshot, ConnectionState } from '@/contracts';
import { BOARD_COLORS, connectionColor } from '@/ui/theme';

/** Render the fixed-height application header and connection summary. */
export function StatusBar({
  snapshot,
}: {
  readonly snapshot: AgentBoardSnapshot;
  readonly notice?: string | undefined;
}): ReactNode {
  const color = connectionColor(snapshot.connection);
  return (
    <box
      height={3}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      border={['bottom']}
      borderColor={BOARD_COLORS.border}
      overflow="hidden"
    >
      <box
        width={28}
        minWidth={28}
        height={3}
        flexShrink={0}
        alignItems="center"
        paddingLeft={2}
        border={['right']}
        borderColor={BOARD_COLORS.border}
      >
        <text fg={BOARD_COLORS.cyan} wrapMode="none">
          ▣ Agent Board
        </text>
      </box>
      <box flexGrow={1} minWidth={0} paddingX={2} overflow="hidden">
        <text fg={BOARD_COLORS.textMuted} wrapMode="none" truncate>
          {`${snapshot.agents.length} agents  •  ${snapshot.attentionCount} need attention  •  `}
          <span fg={color}>{connectionLabel(snapshot.connection)}</span>
        </text>
      </box>
      <box flexShrink={0} paddingRight={2}>
        <text fg={BOARD_COLORS.textDim} wrapMode="none">
          {`visible: ${snapshot.visibleAgents.length}`}
        </text>
      </box>
    </box>
  );
}

/** Render the stable toolbar, including a reserved one-line status notice. */
export function BoardToolbar({
  snapshot,
  notice,
  searching,
  onSearch,
  onSubmit,
}: {
  readonly snapshot: AgentBoardSnapshot;
  readonly notice: string | undefined;
  readonly searching: boolean;
  readonly onSearch: (value: string) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  const message = visibleStatusMessage(snapshot, notice);
  return (
    <box
      height={4}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      border={['bottom']}
      borderColor={BOARD_COLORS.borderMuted}
      paddingX={1}
      gap={1}
      overflow="hidden"
    >
      <box
        width={22}
        minWidth={22}
        height={3}
        flexShrink={0}
        border
        borderStyle="rounded"
        borderColor={searching ? BOARD_COLORS.cyan : BOARD_COLORS.borderMuted}
        paddingX={1}
        overflow="hidden"
      >
        {searching ? (
          <input
            focused
            value={snapshot.search}
            placeholder="Search"
            onInput={onSearch}
            onSubmit={onSubmit}
          />
        ) : (
          <text fg={BOARD_COLORS.textMuted} wrapMode="none">
            ⌕ / search
          </text>
        )}
      </box>
      <ToolbarChip text={`filter: ${formatFilter(snapshot.filter)}`} width={25} />
      <text fg={BOARD_COLORS.textMuted} wrapMode="none">
        {`sort: ${formatSort(snapshot.sort)}  ↑↓  ◉ select  ↵ focus  ? help`}
      </text>
      <box flexGrow={1} minWidth={0} />
      <box
        width={48}
        minWidth={32}
        maxWidth={48}
        height={3}
        flexShrink={1}
        border
        borderStyle="rounded"
        borderColor={message === undefined ? BOARD_COLORS.borderMuted : BOARD_COLORS.amber}
        paddingX={1}
        overflow="hidden"
      >
        <text
          fg={message === undefined ? BOARD_COLORS.textDim : BOARD_COLORS.amber}
          wrapMode="none"
          truncate
        >
          {message === undefined
            ? snapshot.connection === 'live'
              ? '◉  Live updates synchronized'
              : ''
            : `⌁  ${message}`}
        </text>
      </box>
    </box>
  );
}

/** Render the fixed footer with application identity and clock. */
export function BoardFooter({ snapshot }: { readonly snapshot: AgentBoardSnapshot }): ReactNode {
  const time = new Date(snapshot.generatedAt).toLocaleTimeString('en-GB', { hour12: false });
  return (
    <box
      height={3}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      border={['top']}
      borderColor={BOARD_COLORS.border}
      paddingX={2}
    >
      <text fg={BOARD_COLORS.cyan} wrapMode="none">
        Herdr │ Agent Board
      </text>
      <text fg={BOARD_COLORS.textMuted} wrapMode="none">
        <span fg={BOARD_COLORS.cyan}>{time}</span>
      </text>
    </box>
  );
}

/** Select the single transport or command message that is safe to show now. */
export function visibleStatusMessage(
  snapshot: AgentBoardSnapshot,
  notice: string | undefined,
): string | undefined {
  const visibleNotice = shouldShowNotice(snapshot.connection, notice) ? notice : undefined;
  const snapshotMessage =
    snapshot.message !== undefined && isTransportNotice(snapshot.message)
      ? undefined
      : snapshot.message;
  return snapshotMessage ?? visibleNotice;
}

function ToolbarChip({
  text,
  width,
}: {
  readonly text: string;
  readonly width: number;
}): ReactNode {
  return (
    <box
      width={width}
      minWidth={width}
      height={3}
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={BOARD_COLORS.borderMuted}
      paddingX={1}
      overflow="hidden"
    >
      <text fg={BOARD_COLORS.textMuted} wrapMode="none" truncate>
        {text}
      </text>
    </box>
  );
}

function shouldShowNotice(connection: ConnectionState, notice: string | undefined): boolean {
  if (notice === undefined) return false;
  if (connection === 'live' || connection === 'stale') return !isTransportNotice(notice);
  return true;
}

function isTransportNotice(notice: string): boolean {
  return /\b(?:socket|transport|connection|reconnect(?:ed|ing|ion)?)\b/i.test(notice);
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
