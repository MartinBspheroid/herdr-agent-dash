import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { act } from 'react';

import type { AgentBoardSnapshot, AgentCard } from '@/contracts';
import { AgentRow } from '@/ui/AgentRow';
import { StatusBar } from '@/ui/StatusBar';

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
    const setup = await testRender(<StatusBar snapshot={snapshot} notice={undefined} />, {
      width: 100,
      height: 6,
    });
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
      <StatusBar
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
        }}
        notice="This socket has been ended by the other party"
      />,
      { width: 100, height: 6 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      expect(frame).toContain('LIVE');
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
});
