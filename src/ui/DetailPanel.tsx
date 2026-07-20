import type { ReactNode } from 'react';

import type { AgentCard } from '@/contracts';
import { compactPath, truncateText } from '@/safety/bounded-text';
import { sanitizeTerminalText } from '@/safety/sanitize-terminal';

/** Render selected-agent evidence, with an optional fixed width for stable wide layouts. */
export function DetailPanel({
  card,
  compact,
  compactPathSegments = 3,
  now,
  panelWidth,
}: {
  readonly card: AgentCard | undefined;
  readonly compact: boolean;
  readonly compactPathSegments?: number;
  readonly now: number;
  readonly panelWidth?: number | undefined;
}): ReactNode {
  if (card === undefined)
    return (
      <box border padding={1}>
        <text>No agent selected.</text>
      </box>
    );
  const signal = card.activity.currentSignal;
  const git = card.git;
  const panelLayout =
    panelWidth === undefined
      ? {}
      : {
          width: panelWidth,
          minWidth: panelWidth,
          maxWidth: panelWidth,
          flexShrink: 0,
        };
  return (
    <box border borderStyle="single" padding={1} flexDirection="column" gap={0} {...panelLayout}>
      <text fg="#8be9fd" wrapMode="none" truncate>
        SELECTED · {safeDisplay(card.displayName, 256)} · {card.state.toUpperCase()}
      </text>
      <text wrapMode="none" truncate>
        cwd{' '}
        {truncateText(
          compactPath(
            safeDisplay(card.effectiveCwd ?? 'Unavailable', 512),
            compactPathSegments ?? 3,
          ),
          compact ? 60 : 120,
        )}
      </text>
      <text wrapMode="none" truncate>
        location {safeDisplay(card.workspaceLabel ?? '—', 128)} /{' '}
        {safeDisplay(card.tabLabel ?? '—', 128)} / {safeDisplay(card.paneId ?? '—', 128)}
      </text>
      <text wrapMode="none" truncate>
        signal{' '}
        {signal === undefined
          ? 'No reported activity'
          : `${safeDisplay(signal.sourceLabel, 128)}: ${truncateText(safeDisplay(signal.text, 512), compact ? 70 : 140)} · ${formatAge(signal.observedAt, now)}${signal.stale ? ' · stale' : ''}`}
      </text>
      <text wrapMode="none" truncate>
        meaning {formatSemantics(signal?.semantics)} · confidence{' '}
        {formatConfidence(signal?.confidence)}
      </text>
      <text wrapMode="none" truncate>
        state age {formatAge(card.stateSince, now)}
      </text>
      {card.nativeSession === undefined ? null : (
        <text wrapMode="none" truncate>
          session {safeDisplay(card.nativeSession.source, 128)}/
          {safeDisplay(card.nativeSession.kind, 128)}:{' '}
          {truncateText(safeDisplay(card.nativeSession.value, 512), compact ? 60 : 120)}
        </text>
      )}
      <text wrapMode="none" truncate>
        git {formatGit(git)}
      </text>
      {card.activity.lastRequest !== undefined ? (
        <text wrapMode="none" truncate>
          request Last request:{' '}
          {truncateText(safeDisplay(card.activity.lastRequest.text, 512), 100)}
        </text>
      ) : null}
      {card.activity.repositoryChange !== undefined ? (
        <text wrapMode="none" truncate>
          changes {safeDisplay(card.activity.repositoryChange.text, 512)}
        </text>
      ) : null}
    </box>
  );
}

function formatGit(git: AgentCard['git']): string {
  if (git.status === 'not_git') return 'not a Git repository';
  if (git.status === 'loading') return 'loading';
  if (git.status === 'error') return `error (${git.errorCode ?? 'unknown'})`;
  if (git.status === 'stale') return 'stale';
  const branch =
    git.branch ?? (git.detachedHead === undefined ? '—' : `detached ${git.detachedHead}`);
  const changes =
    git.changedFiles === undefined
      ? 'changes unknown'
      : `${git.changedFiles} changed file${git.changedFiles === 1 ? '' : 's'}`;
  return `${safeDisplay(git.repoName ?? git.repoRoot ?? 'repository', 256)} · ${safeDisplay(branch, 256)} · ${changes}`;
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
  return value === undefined ? 'unknown' : value;
}

function safeDisplay(value: string, maxBytes: number): string {
  return sanitizeTerminalText(value, maxBytes).text;
}

function formatAge(observedAt: number | undefined, now: number): string {
  if (observedAt === undefined) return 'age unavailable';
  const seconds = Math.max(0, Math.floor((now - observedAt) / 1_000));
  return `${seconds}s ago`;
}
