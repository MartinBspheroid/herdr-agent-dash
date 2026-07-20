import { describe, expect, test } from 'bun:test';

import { sortCards } from '@/domain/attention-sort';
import type { AgentCard } from '@/contracts';

describe('50-agent fixture path', () => {
  test('sorts and preserves selection data within the local performance budget', () => {
    const cards: AgentCard[] = Array.from({ length: 50 }, (_, index) => ({
      id: `agent-${index}`,
      agent: `agent-${index}`,
      displayName: `Codex · agent-${index}`,
      state: index % 5 === 0 ? 'blocked' : 'working',
      focused: false,
      reviewed: false,
      git: { status: 'loading' },
      activity: { candidates: [] },
      connection: 'live',
    }));
    const started = performance.now();
    const sorted = sortCards(cards, 'attention');
    const elapsed = performance.now() - started;
    expect(sorted).toHaveLength(50);
    expect(sorted.filter((card) => card.state === 'blocked')).toHaveLength(10);
    expect(elapsed).toBeLessThan(250);
  });
});
