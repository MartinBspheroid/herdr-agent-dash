import type { ReactNode } from 'react';

import type { AgentCard } from '@/contracts';
import { compactPath, truncateText } from '@/safety/bounded-text';
import { sanitizeTerminalText } from '@/safety/sanitize-terminal';
import { BOARD_COLORS, stateColor } from '@/ui/theme';

/** Render the selected agent as stable, labelled evidence sections. */
export function DetailPanel({
  card,
  compact,
  compactPathSegments = 3,
  now,
  panelWidth,
  statusMessage,
}: {
  readonly card: AgentCard | undefined;
  readonly compact: boolean;
  readonly compactPathSegments?: number;
  readonly now: number;
  readonly panelWidth?: number | undefined;
  readonly statusMessage?: string | undefined;
}): ReactNode {
  const panelLayout =
    panelWidth === undefined
      ? { flexGrow: 1, minHeight: 10 }
      : {
          width: panelWidth,
          minWidth: panelWidth,
          maxWidth: panelWidth,
          flexShrink: 0,
        };
  const dividerWidth = Math.max(16, (panelWidth ?? 48) - 4);
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={BOARD_COLORS.border}
      backgroundColor={BOARD_COLORS.panel}
      paddingX={1}
      flexDirection="column"
      overflow="hidden"
      {...panelLayout}
    >
      <text fg={BOARD_COLORS.cyan} wrapMode="none">
        SELECTED AGENT
      </text>
      <Divider width={dividerWidth} />
      {card === undefined ? (
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text fg={BOARD_COLORS.textMuted}>No agent selected.</text>
        </box>
      ) : (
        <SelectedAgent
          card={card}
          compact={compact}
          compactPathSegments={compactPathSegments}
          now={now}
          dividerWidth={dividerWidth}
          statusMessage={statusMessage}
        />
      )}
    </box>
  );
}

function SelectedAgent({
  card,
  compact,
  compactPathSegments,
  now,
  dividerWidth,
  statusMessage,
}: {
  readonly card: AgentCard;
  readonly compact: boolean;
  readonly compactPathSegments: number;
  readonly now: number;
  readonly dividerWidth: number;
  readonly statusMessage: string | undefined;
}): ReactNode {
  const signal = card.activity.currentSignal;
  const color = stateColor(card.state);
  return (
    <>
      <box flexDirection="row" alignItems="center" height={1} gap={1} overflow="hidden">
        <text fg={color}>●</text>
        <text fg={BOARD_COLORS.text} wrapMode="none" truncate>
          {safeDisplay(card.displayName, 256)}
        </text>
        <box backgroundColor={BOARD_COLORS.panelRaised} paddingX={1} height={1}>
          <text fg={color} wrapMode="none">
            {card.state.toUpperCase()}
          </text>
        </box>
      </box>
      <DetailRow
        label="cwd"
        value={truncateText(
          compactPath(safeDisplay(card.effectiveCwd ?? 'Unavailable', 512), compactPathSegments),
          compact ? 48 : 96,
        )}
      />
      <DetailRow
        label="location"
        value={`${safeDisplay(card.workspaceLabel ?? '—', 128)} / ${safeDisplay(card.tabLabel ?? '—', 128)} / ${safeDisplay(card.paneId ?? '—', 128)}`}
      />
      <DetailRow label="source" value={safeDisplay(signal?.sourceLabel ?? 'No signal', 128)} />
      <DetailRow
        label="since"
        value={`${formatAge(signal?.observedAt, now)}${signal?.stale === true ? '  •  stale' : ''}`}
        valueColor={signal?.stale === true ? BOARD_COLORS.amber : undefined}
      />

      <SectionTitle title="SIGNAL" dividerWidth={dividerWidth} />
      <DetailRow
        label="signal"
        value={truncateText(safeDisplay(signal?.text ?? 'No reported activity', 512), 100)}
      />
      <DetailRow
        label="meaning"
        value={`${formatSemantics(signal?.semantics)}  •  confidence ${formatConfidence(signal?.confidence)}`}
      />
      <DetailRow label="state age" value={formatAge(card.stateSince, now)} />
      {card.nativeSession === undefined ? null : (
        <DetailRow
          label="session"
          value={`${safeDisplay(card.nativeSession.source, 64)}:${truncateText(safeDisplay(card.nativeSession.value, 512), 72)}`}
        />
      )}

      <SectionTitle title="GIT" dividerWidth={dividerWidth} />
      <DetailRow label="repository" value={gitRepository(card)} />
      <DetailRow label="branch" value={gitBranch(card)} />
      <DetailRow label="changes" value={gitChanges(card)} />

      <SectionTitle title="STATUS" dividerWidth={dividerWidth} />
      <box flexDirection="row" paddingLeft={1} overflow="hidden">
        <text fg={statusMessage === undefined ? BOARD_COLORS.green : BOARD_COLORS.amber}>◉</text>
        <text fg={BOARD_COLORS.textMuted} wrapMode="none" truncate>
          {` ${statusMessage ?? 'Live updates synchronized'}`}
        </text>
      </box>
    </>
  );
}

function SectionTitle({
  title,
  dividerWidth,
}: {
  readonly title: string;
  readonly dividerWidth: number;
}): ReactNode {
  return (
    <box flexDirection="column" marginTop={1}>
      <Divider width={dividerWidth} />
      <text fg={BOARD_COLORS.cyan} wrapMode="none">
        {title}
      </text>
    </box>
  );
}

function Divider({ width }: { readonly width: number }): ReactNode {
  return (
    <text fg={BOARD_COLORS.borderMuted} wrapMode="none" truncate>
      {'─'.repeat(width)}
    </text>
  );
}

function DetailRow({
  label,
  value,
  valueColor = BOARD_COLORS.textMuted,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueColor?: string | undefined;
}): ReactNode {
  return (
    <box flexDirection="row" minWidth={0} overflow="hidden">
      <text width={12} minWidth={12} flexShrink={0} fg={BOARD_COLORS.textDim} wrapMode="none">
        {label}
      </text>
      <text flexGrow={1} minWidth={0} fg={valueColor} wrapMode="none" truncate>
        {value}
      </text>
    </box>
  );
}

function gitRepository(card: AgentCard): string {
  const git = card.git;
  if (git.status === 'not_git') return 'not a Git repository';
  if (git.status === 'loading') return 'loading';
  if (git.status === 'error') return `error (${git.errorCode ?? 'unknown'})`;
  return safeDisplay(git.repoName ?? git.repoRoot ?? 'repository', 256);
}

function gitBranch(card: AgentCard): string {
  return safeDisplay(
    card.git.branch ??
      (card.git.detachedHead === undefined ? '—' : `detached ${card.git.detachedHead}`),
    256,
  );
}

function gitChanges(card: AgentCard): string {
  const count = card.git.changedFiles;
  return count === undefined ? 'changes unknown' : `${count} changed file${count === 1 ? '' : 's'}`;
}

function formatSemantics(
  value: AgentCard['activity']['currentSignal'] extends infer Signal
    ? Signal extends { readonly semantics: infer Semantics }
      ? Semantics | undefined
      : undefined
    : undefined,
): string {
  switch (value) {
    case 'current_signal':
      return 'current signal';
    case 'last_request':
      return 'last request';
    case 'raw_output':
      return 'recent output';
    case 'repository_change':
      return 'repository change';
    default:
      return 'none';
  }
}

function formatConfidence(value: 'explicit' | 'derived' | 'raw' | 'unknown' | undefined): string {
  return value ?? 'unknown';
}

function safeDisplay(value: string, maxBytes: number): string {
  return sanitizeTerminalText(value, maxBytes).text;
}

function formatAge(observedAt: number | undefined, now: number): string {
  if (observedAt === undefined) return 'age unavailable';
  return `${Math.max(0, Math.floor((now - observedAt) / 1_000))}s ago`;
}
