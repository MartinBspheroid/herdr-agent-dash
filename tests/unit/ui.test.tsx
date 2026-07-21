import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { act } from 'react';

import type { AgentBoardSnapshot, AgentCard } from '@/contracts';
import { AgentRow } from '@/ui/AgentRow';
import { AgentTable } from '@/ui/AgentTable';
import { DetailPanel } from '@/ui/DetailPanel';
import { BoardFooter, BoardToolbar, StatusBar } from '@/ui/StatusBar';

const card: AgentCard = {
  id: 'term-1',
  terminalId: 'term-1',
  agent: 'Claude',
  displayName: 'Claude · reviewer',
  state: 'blocked',
  focused: false,
  reviewed: false,
  workspaceLabel: 'workspace',
  tabLabel: 'main',
  paneLabel: 'pane-1',
  effectiveCwd: '/tmp/project',
  git: { status: 'ready', repoName: 'project', branch: 'main' },
  activity: {
    currentSignal: {
      text: 'Approval requested',
      source: 'reported_state_message',
      semantics: 'current_signal',
      confidence: 'explicit',
      sourceLabel: 'Reported state message',
      stale: false,
    },
    candidates: [],
  },
  connection: 'live',
};

describe('OpenTUI board surfaces', () => {
  test('renders a labelled row snapshot', async () => {
    const setup = await testRender(
      <AgentRow card={card} selected visibleColumns={['state', 'agent', 'signal']} />,
      { width: 80, height: 4 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      expect(frame).toContain('BLOCKED');
      expect(frame).toContain('Claude');
      expect(frame).toContain('Approval requested');
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });

  test('keeps long rows on one line and truncates at the viewport edge', async () => {
    const setup = await testRender(
      <AgentRow
        card={{
          ...card,
          workspaceLabel: 'workspace-with-a-very-long-name',
          tabLabel: 'tab-with-a-very-long-name',
          paneLabel: 'pane-with-a-very-long-name',
          activity: {
            currentSignal: {
              ...card.activity.currentSignal!,
              text: 'A long signal that must not wrap into the next table row',
            },
            candidates: [],
          },
          git: {
            status: 'ready',
            repoName: 'repository-with-a-very-long-name',
            branch: 'feature/with-a-very-long-branch-name',
          },
        }}
        selected
        visibleColumns={['state', 'agent', 'location', 'signal', 'repository', 'branch']}
      />,
      { width: 80, height: 4 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      expect(frame.split('\n').filter((line) => line.trim().length > 0)).toHaveLength(1);
      expect(frame).toContain('…');
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });

  test('renders connection health and actionable notices', async () => {
    const snapshot: AgentBoardSnapshot = {
      connection: 'stale',
      agents: [card],
      visibleAgents: [card],
      selectedAgentId: card.id,
      attentionCount: 1,
      filter: 'all',
      sort: 'attention',
      search: '',
      generatedAt: 1,
      message: 'Herdr protocol is unsupported',
    };
    const setup = await testRender(
      <box flexDirection="column">
        <StatusBar snapshot={snapshot} />
        <BoardToolbar
          snapshot={snapshot}
          notice={undefined}
          searching={false}
          onSearch={() => undefined}
          onSubmit={() => undefined}
        />
      </box>,
      { width: 140, height: 8 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      expect(frame).toContain('STALE');
      expect(frame).toContain('Herdr protocol is unsupported');
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });

  test('does not show a recovered socket error beside a live connection', async () => {
    const setup = await testRender(
      <BoardToolbar
        snapshot={{
          connection: 'live',
          agents: [card],
          visibleAgents: [card],
          selectedAgentId: card.id,
          attentionCount: 1,
          filter: 'all',
          sort: 'attention',
          search: '',
          generatedAt: 1,
          message: 'This socket has been ended by the other party',
        }}
        notice="This socket has been ended by the other party"
        searching={false}
        onSearch={() => undefined}
        onSubmit={() => undefined}
      />,
      { width: 140, height: 5 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      expect(frame).toContain('Live updates synchronized');
      expect(frame).not.toContain('socket has been ended');
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });

  test('removes terminal display controls before rendering row content', async () => {
    const setup = await testRender(
      <AgentRow
        card={{ ...card, displayName: 'Codex\u001b[31m', activity: { candidates: [] } }}
        selected
        visibleColumns={['agent']}
      />,
      { width: 80, height: 4 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      expect(frame).toContain('Codex');
      expect(frame).not.toContain('\u001b');
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });

  test('keeps table headers and long rows in fixed single-line columns', async () => {
    const longCard: AgentCard = {
      ...card,
      displayName: 'Claude with a name that cannot resize a column',
      workspaceLabel: 'workspace-with-a-name-that-must-be-truncated',
      activity: {
        currentSignal: {
          ...card.activity.currentSignal!,
          text: 'A signal whose length must never alter the geometry of the surrounding table',
        },
        candidates: [],
      },
    };
    const secondCard: AgentCard = { ...card, id: 'term-2', terminalId: 'term-2' };
    const snapshot: AgentBoardSnapshot = {
      connection: 'live',
      agents: [longCard, secondCard],
      visibleAgents: [longCard, secondCard],
      selectedAgentId: longCard.id,
      attentionCount: 2,
      filter: 'all',
      sort: 'attention',
      search: '',
      generatedAt: 1,
    };
    const setup = await testRender(
      <AgentTable
        snapshot={snapshot}
        visibleColumns={['state', 'agent', 'location', 'signal', 'repository', 'branch']}
        compactPathSegments={3}
        layout="wide"
      />,
      { width: 150, height: 12 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const lines = setup.captureCharFrame().split('\n');
      const header = lines.find((line) => line.includes('STATE'));
      const firstRow = lines.find((line) => line.includes('BLOCKED'));
      expect(header).toBeDefined();
      expect(firstRow).toBeDefined();
      expect(header?.indexOf('AGENT')).toBe(firstRow?.indexOf('Claude'));
      expect(firstRow).toContain('…');
      expect(lines.filter((line) => line.includes('BLOCKED'))).toHaveLength(2);
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });

  test('renders selected-agent information as stable labelled sections', async () => {
    const setup = await testRender(
      <DetailPanel
        card={card}
        compact={false}
        compactPathSegments={3}
        now={1_000}
        panelWidth={56}
      />,
      { width: 56, height: 30 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      expect(frame).toContain('SELECTED AGENT');
      expect(frame).toContain('SIGNAL');
      expect(frame).toContain('GIT');
      expect(frame).not.toContain('STATUS');
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });

  test('shows reconnect state only once in the top header', async () => {
    const snapshot: AgentBoardSnapshot = {
      connection: 'stale',
      agents: [card],
      visibleAgents: [card],
      selectedAgentId: card.id,
      attentionCount: 1,
      filter: 'all',
      sort: 'attention',
      search: '',
      generatedAt: 1,
      message: 'Showing stale data; reconnecting to Herdr',
    };
    const setup = await testRender(
      <box flexDirection="column">
        <StatusBar snapshot={snapshot} />
        <BoardToolbar
          snapshot={snapshot}
          notice={undefined}
          searching={false}
          onSearch={() => undefined}
          onSubmit={() => undefined}
        />
        <DetailPanel card={card} compact={false} now={snapshot.generatedAt} panelWidth={56} />
        <BoardFooter snapshot={snapshot} />
      </box>,
      { width: 180, height: 40 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const matches = setup.captureCharFrame().match(/reconnect/gi) ?? [];
      expect(matches).toHaveLength(1);
    } finally {
      act(() => {
        setup.renderer.destroy();
      });
    }
  });
});
