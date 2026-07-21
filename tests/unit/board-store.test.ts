import { describe, expect, test } from 'bun:test';

import { ActivityEngine } from '@/activity/engine';
import { DefaultAgentBoardStore } from '@/app/agent-board-store';
import { SystemClock } from '@/app/runtime';
import { AgentProjector } from '@/domain/agent-projector';
import type { GitEnricher, GitRefreshReason } from '@/git/git-enricher';
import type { GitContext } from '@/contracts';
import { LiveSessionStore } from '@/herdr/session-store';
import { fixtureSnapshot } from '@tests/fixtures/herdr';
import { MutableSnapshotTransport } from '@tests/fixtures/session-transports';

describe('renderer-independent board store', () => {
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
