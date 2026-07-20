import type { AgentBoardSnapshot, AgentBoardStore, AgentCard } from '@/contracts';

/** Create a deterministic fake board store for compact, standard, and wide UI tests. */
export function createFixtureBoardStore(cards: readonly AgentCard[]): AgentBoardStore {
  let selectedAgentId = cards[0]?.id;
  let search = '';
  const listeners = new Set<() => void>();
  const snapshot = (): AgentBoardSnapshot => ({
    connection: 'live',
    agents: cards,
    visibleAgents: cards,
    selectedAgentId,
    attentionCount: cards.filter((card) => card.state === 'blocked').length,
    filter: 'all',
    sort: 'attention',
    search,
    generatedAt: 1,
  });
  return {
    getSnapshot: snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select: (id) => {
      selectedAgentId = id;
      for (const listener of listeners) listener();
    },
    moveSelection: () => undefined,
    setSearch: (value) => {
      search = value;
      for (const listener of listeners) listener();
    },
    setFilter: () => undefined,
    setSort: () => undefined,
    markReviewed: () => undefined,
  };
}
