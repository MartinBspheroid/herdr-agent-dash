import { describe, expect, test } from 'bun:test';

import { ActivityEngine } from '@/activity/engine';
import { DefaultAgentBoardStore } from '@/app/agent-board-store';
import { SystemClock } from '@/app/runtime';
import { AgentProjector } from '@/domain/agent-projector';
import type { GitEnricher, GitRefreshReason } from '@/git/git-enricher';
import type { GitContext } from '@/contracts';
import type { AgentCard } from '@/contracts';
import { LiveSessionStore } from '@/herdr/session-store';
import { fixtureSnapshot } from '@tests/fixtures/herdr';
import { MutableSnapshotTransport } from '@tests/fixtures/session-transports';

describe('renderer-independent board store', () => {
  test('renders cached cards before the live session starts', () => {
    const transport = new MutableSnapshotTransport(fixtureSnapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    const git = new RecordingGitEnricher();
    const projector = new AgentProjector(git, new ActivityEngine([]), new SystemClock());
    const cached: AgentCard = {
      id: 'cached-agent',
      agent: 'Cached',
      displayName: 'cached',
      state: 'idle',
      focused: false,
      reviewed: false,
      git: { status: 'stale' },
      activity: { candidates: [] },
      connection: 'stale',
    };
    const store = new DefaultAgentBoardStore({
      session,
      git,
      projector,
      clock: new SystemClock(),
      initialCards: [cached],
    });

    expect(store.getSnapshot().agents).toEqual([cached]);
    expect(store.getSnapshot().connection).toBe('connecting');
  });

  test('hides unknown rows without removing them from the agent count', async () => {
    const snapshot = {
      ...fixtureSnapshot,
      panes: [
        ...fixtureSnapshot.panes,
        {
          id: 'p3',
          terminal_id: 'term-3',
          tab_id: 't1',
          workspace_id: 'w1',
          agent_id: 'a3',
          agent: 'Terminal',
          agent_status: 'unknown',
        },
      ],
      agents: [...fixtureSnapshot.agents, { id: 'a3', name: 'Terminal', status: 'unknown' }],
    };
    const transport = new MutableSnapshotTransport(snapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    const git = new RecordingGitEnricher();
    const projector = new AgentProjector(git, new ActivityEngine([]), new SystemClock());
    const store = new DefaultAgentBoardStore({
      session,
      git,
      projector,
      clock: new SystemClock(),
      showUnknown: false,
    });
    await store.start();

    expect(store.getSnapshot().agents).toHaveLength(3);
    expect(store.getSnapshot().visibleAgents).toHaveLength(2);
    expect(store.getSnapshot().showUnknown).toBe(false);
    store.setShowUnknown(true);
    expect(store.getSnapshot().visibleAgents).toHaveLength(3);
    await store.dispose();
  });

  test('keeps selection across unrelated updates and reconciles a closed row', async () => {
    const transport = new MutableSnapshotTransport(fixtureSnapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    const git = new RecordingGitEnricher();
    const projector = new AgentProjector(git, new ActivityEngine([]), new SystemClock());
    const store = new DefaultAgentBoardStore({ session, git, projector, clock: new SystemClock() });
    await store.start();
    store.select('term-1');

    transport.emit('pane.updated', { pane: { id: 'p2', agent_status: 'working' } });
    await waitFor(() => store.getSnapshot().visibleAgents.some((card) => card.state === 'working'));
    expect(store.getSnapshot().selectedAgentId).toBe('term-1');

    transport.emit('worktree.removed', {});
    await waitFor(() => git.invalidations.length > 0);
    expect(git.invalidations).toContain('/tmp/project');

    transport.snapshotValue = {
      ...fixtureSnapshot,
      panes: fixtureSnapshot.panes.filter((pane) => 'id' in pane && pane.id !== 'p1'),
      agents: fixtureSnapshot.agents.filter((agent) => 'id' in agent && agent.id !== 'a1'),
    };
    transport.emit('pane.closed', { pane_id: 'p1' });
    await waitFor(() => store.getSnapshot().agents.length === 1);
    expect(store.getSnapshot().selectedAgentId).toBe('term-2');
    await store.dispose();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('condition did not become true');
}

class RecordingGitEnricher implements GitEnricher {
  public readonly invalidations: string[] = [];

  public get(_cwd: string): GitContext {
    return { status: 'not_git' };
  }

  public async ensure(_cwd: string, _reason: GitRefreshReason): Promise<GitContext> {
    return { status: 'not_git' };
  }

  public invalidate(cwdOrRepo: string, _reason: GitRefreshReason): void {
    this.invalidations.push(cwdOrRepo);
  }

  public subscribe(_listener: (key: string) => void): () => void {
    return () => undefined;
  }

  public async dispose(): Promise<void> {}
}
