import { performance } from 'node:perf_hooks';

import { SystemClock } from '@/app/runtime';
import { ActivityEngine } from '@/activity/engine';
import { AgentProjector } from '@/domain/agent-projector';
import type { AgentRecord, PaneRecord, SessionStoreSnapshot } from '@/contracts';
import { sortCards } from '@/domain/attention-sort';

/** Synthetic board measurement for one fixture size. */
export interface AgentBenchmark {
  readonly count: number;
  readonly projectMs: number;
  readonly enrichMs: number;
  readonly sortMs: number;
  readonly heapDeltaBytes: number;
}

/** Measure the deterministic attention sort used by the UI. */
export function benchmarkAgents(count = 50): number {
  const projector = new AgentProjector(
    { get: () => ({ status: 'loading' }) },
    new ActivityEngine([]),
    new SystemClock(),
  );
  const cards = projector.project(createSnapshot(count));
  const start = performance.now();
  sortCards(cards, 'attention');
  return performance.now() - start;
}

/** Measure sort time and process heap change for a synthetic board fixture. */
export async function measureAgents(count: number): Promise<AgentBenchmark> {
  const snapshot = createSnapshot(count);
  const projector = new AgentProjector(
    { get: () => ({ status: 'loading' }) },
    new ActivityEngine([]),
    new SystemClock(),
  );
  const projectStart = performance.now();
  const cards = projector.project(snapshot);
  const projectMs = performance.now() - projectStart;
  const enrichStart = performance.now();
  const enriched = await projector.enrichActivity(cards, snapshot);
  const enrichMs = performance.now() - enrichStart;
  const before = process.memoryUsage().heapUsed;
  const sortStart = performance.now();
  const sorted = sortCards(enriched, 'attention');
  const sortMs = performance.now() - sortStart;
  const heapDeltaBytes = process.memoryUsage().heapUsed - before;
  if (sorted.length !== count) throw new Error('benchmark lost fixture rows');
  return { count, projectMs, enrichMs, sortMs, heapDeltaBytes };
}

function createSnapshot(count: number): SessionStoreSnapshot {
  const agents = new Map<string, AgentRecord>();
  const panes = new Map<string, PaneRecord>();
  for (let index = 0; index < count; index += 1) {
    const id = `benchmark-${index}`;
    const state = index % 5 === 0 ? 'blocked' : 'working';
    agents.set(id, { id, name: `agent-${index}`, status: state });
    panes.set(id, {
      id,
      terminalId: `terminal-${index}`,
      tabId: `tab-${index}`,
      workspaceId: `workspace-${index}`,
      agentId: id,
      agent: `agent-${index}`,
      agentStatus: state,
      metadata: {},
      focused: false,
    });
  }
  return { connection: 'live', workspaces: new Map(), tabs: new Map(), panes, agents };
}

if (import.meta.main) {
  const measurements = await Promise.all([20, 50, 1_000].map(measureAgents));
  process.stdout.write(
    `${measurements
      .map(
        (item) =>
          `${item.count}-agent project: ${item.projectMs.toFixed(2)}ms, enrich: ${item.enrichMs.toFixed(2)}ms, sort: ${item.sortMs.toFixed(2)}ms, heap delta: ${item.heapDeltaBytes} bytes`,
      )
      .join('\n')}\n`,
  );
}
