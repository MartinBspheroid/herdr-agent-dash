import type { AgentCard, BoardSort } from '@/contracts';

/** Sort cards deterministically using the board's attention policy or a user sort. */
export function sortCards(cards: readonly AgentCard[], sort: BoardSort): readonly AgentCard[] {
  return cards.toSorted((left, right) => {
    const primary =
      sort === 'attention'
        ? attentionRank(left) - attentionRank(right)
        : sort === 'recent'
          ? recentTimestamp(right) - recentTimestamp(left)
          : compareField(left, right, sort);
    if (primary !== 0) return primary;
    if (sort === 'attention') {
      const time = compareAge(left, right);
      if (time !== 0) return time;
    }
    return left.id.localeCompare(right.id);
  });
}

/** Return whether a card contributes to the attention counter. */
export function needsAttention(card: AgentCard): boolean {
  return (
    card.state === 'blocked' ||
    (card.state === 'done' && !card.reviewed) ||
    card.state === 'unknown' ||
    card.connection === 'stale'
  );
}

function attentionRank(card: AgentCard): number {
  switch (card.state) {
    case 'blocked':
      return 0;
    case 'done':
      return card.reviewed ? 5 : 1;
    case 'unknown':
      return 2;
    case 'working':
      return 3;
    case 'idle':
      return 4;
  }
}

function compareAge(left: AgentCard, right: AgentCard): number {
  if (left.state === 'working' || left.state === 'idle')
    return (right.stateSince ?? 0) - (left.stateSince ?? 0);
  return (
    (left.stateSince ?? Number.MAX_SAFE_INTEGER) - (right.stateSince ?? Number.MAX_SAFE_INTEGER)
  );
}

function compareField(left: AgentCard, right: AgentCard, sort: BoardSort): number {
  const value = (card: AgentCard): string => {
    switch (sort) {
      case 'state':
        return card.state;
      case 'workspace':
        return card.workspaceLabel ?? '';
      case 'repository':
        return card.git.repoName ?? '';
      case 'branch':
        return card.git.branch ?? card.git.detachedHead ?? '';
      case 'agent':
        return card.displayName;
      case 'recent':
        return '';
      case 'attention':
        return '';
    }
  };
  return value(left).localeCompare(value(right));
}

function recentTimestamp(card: AgentCard): number {
  return card.lastHostEventAt ?? card.activity.currentSignal?.observedAt ?? 0;
}
