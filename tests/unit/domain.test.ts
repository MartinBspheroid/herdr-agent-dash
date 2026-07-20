import { describe, expect, test } from 'bun:test';

import type { ActivityProvider, ActivityContext } from '@/activity/provider';
import type { ActivitySignal } from '@/contracts';
import { ActivityEngine } from '@/activity/engine';
import { AgentProjector } from '@/domain/agent-projector';
import { normalizeSnapshot } from '@/herdr/protocol';
import { fixtureSnapshot } from '@tests/fixtures/herdr';
import { matchesSearch } from '@/domain/search';
import { sortCards } from '@/domain/attention-sort';
import type { AgentCard } from '@/contracts';

const signal = (text: string): ActivitySignal => ({
  text,
  source: 'reported_metadata',
  semantics: 'current_signal',
  confidence: 'explicit',
  sourceLabel: 'Reported metadata',
  stale: false,
});
const card = (
  id: string,
  state: AgentCard['state'],
  currentSignal: ActivitySignal | undefined,
): AgentCard => ({
  id,
  agent: id,
  displayName: id,
  state,
  focused: false,
  reviewed: false,
  git: { status: 'ready', repoName: 'repo', branch: 'main' },
  activity: { currentSignal, candidates: currentSignal === undefined ? [] : [currentSignal] },
  connection: 'live',
  stateSince: 100,
});

describe('domain semantics', () => {
  test('attention ordering puts blocked before working and is deterministic', () => {
    const sorted = sortCards(
      [card('working', 'working', undefined), card('blocked', 'blocked', undefined)],
      'attention',
    );
    expect(sorted.map((item) => item.id)).toEqual(['blocked', 'working']);
  });

  test('recent sorting prefers the newest observed state', () => {
    const older = { ...card('older', 'working', undefined), stateSince: 10 };
    const newer = { ...card('newer', 'working', undefined), stateSince: 20 };
    expect(sortCards([older, newer], 'recent').map((item) => item.id)).toEqual(['newer', 'older']);
  });

  test('search covers branch and activity', () => {
    const item = {
      ...card('agent-1', 'working', signal('Review cache')),
      git: { status: 'ready' as const, repoName: 'api', branch: 'feat/cache' },
    };
    expect(matchesSearch(item, 'feat/cache')).toBe(true);
    expect(matchesSearch(item, 'review')).toBe(true);
  });

  test('metadata outranks terminal title', async () => {
    const provider = (id: string, priority: number, value: string): ActivityProvider => ({
      id,
      priority,
      supports: (_context: ActivityContext) => true,
      collect: async () => [signal(value)],
    });
    const engine = new ActivityEngine([
      provider('title', 10, 'title'),
      provider('metadata', 100, 'metadata'),
    ]);
    const bundle = await engine.collect({
      agent: { id: 'a', name: 'agent' },
      git: { status: 'not_git' },
      observedAt: 1,
    });
    expect(bundle.currentSignal?.text).toBe('metadata');
    expect(bundle.candidates).toHaveLength(2);
  });

  test('projects one card per agent and prefers foreground cwd', () => {
    const snapshot = normalizeSnapshot(fixtureSnapshot);
    const projector = new AgentProjector(
      { get: () => ({ status: 'not_git' }) },
      new ActivityEngine([]),
      { now: () => 1 },
    );
    const cards = projector.project(snapshot);
    expect(cards).toHaveLength(2);
    expect(cards.map((item) => item.id)).toEqual(['term-1', 'term-2']);
    expect(cards.find((item) => item.id === 'term-1')?.effectiveCwd).toBe('/tmp/project');
    expect(cards.find((item) => item.id === 'term-2')?.state).toBe('blocked');
  });

  test('marks activity evidence stale while the session is disconnected', async () => {
    const snapshot = normalizeSnapshot(fixtureSnapshot, 'stale');
    const projector = new AgentProjector(
      { get: () => ({ status: 'not_git' }) },
      new ActivityEngine([
        {
          id: 'fixture-signal',
          priority: 1,
          supports: () => true,
          collect: async () => [signal('cached signal')],
        },
      ]),
      { now: () => 1 },
    );
    const cards = projector.project(snapshot);
    const enriched = await projector.enrichActivity(cards, snapshot);
    expect(enriched[0]?.connection).toBe('stale');
    expect(enriched[0]?.activity.currentSignal?.stale).toBe(true);
  });
});
