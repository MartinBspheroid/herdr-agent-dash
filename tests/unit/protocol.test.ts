import { describe, expect, test } from 'bun:test';

import { fixtureSnapshot } from '@tests/fixtures/herdr';
import { normalizeSnapshot, parseProtocolLine, parseSnapshot } from '@/herdr/protocol';

describe('Herdr protocol normalization', () => {
  test('isolates malformed records and preserves valid snapshot records', () => {
    const snapshot = normalizeSnapshot(fixtureSnapshot);
    expect(snapshot.workspaces.size).toBe(1);
    expect(snapshot.tabs.size).toBe(1);
    expect(snapshot.panes.size).toBe(2);
    expect(snapshot.agents.size).toBe(2);
    expect(snapshot.panes.get('p1')?.foregroundCwd).toBe('/tmp/project');
  });

  test('unwraps the current result.snapshot response shape', () => {
    const snapshot = normalizeSnapshot({
      result: { type: 'session_snapshot', snapshot: fixtureSnapshot },
    });
    expect(snapshot.panes.size).toBe(2);
    expect(snapshot.agents.get('a2')?.status).toBe('blocked');
  });

  test('reads the live host version and protocol fields', () => {
    const snapshot = normalizeSnapshot({ version: '0.7.4', protocol: 16 });
    expect(snapshot.serverVersion).toBe('0.7.4');
    expect(snapshot.protocolVersion).toBe(16);
  });

  test('normalizes current direct presentation fields as activity metadata', () => {
    const snapshot = normalizeSnapshot({
      panes: [
        {
          id: 'p1',
          tab_id: 't1',
          workspace_id: 'w1',
          agent: 'Codex',
          custom_status: 'Running checks',
        },
      ],
    });
    expect(snapshot.panes.get('p1')?.metadata.custom_status).toBe('Running checks');
  });

  test('accepts unknown fields and structured errors without crashing', () => {
    const event = parseProtocolLine(
      JSON.stringify({ event: 'pane.updated', payload: { pane_id: 'p1' }, future_field: true }),
    );
    expect(event).toEqual({
      event: 'pane.updated',
      payload: { pane_id: 'p1' },
      revision: undefined,
    });
    const typedEvent = parseProtocolLine(
      JSON.stringify({ type: 'pane.agent_status_changed', pane_id: 'p1', agent_status: 'blocked' }),
    );
    expect(typedEvent).toEqual({
      event: 'pane.agent_status_changed',
      payload: { type: 'pane.agent_status_changed', pane_id: 'p1', agent_status: 'blocked' },
      revision: undefined,
    });
    const error = parseProtocolLine(
      JSON.stringify({ id: 'x', error: { code: 'not_found', message: 'gone' } }),
    );
    expect(error).toEqual({
      id: 'x',
      error: { code: 'not_found', message: 'gone', details: undefined },
    });
  });

  test('diagnoses malformed response envelopes instead of resolving them as success', () => {
    expect(parseProtocolLine(JSON.stringify({ id: 'x', error: { code: 'denied' } }))).toEqual({
      id: 'x',
      malformed: true,
      reason: 'response error is malformed',
    });
  });

  test('rejects an object that is not a snapshot while preserving valid empty snapshots', () => {
    expect(parseSnapshot({ not_a_snapshot: true }).ok).toBe(false);
    expect(parseSnapshot({ version: '0.7.4', protocol: 16, panes: [], agents: [] }).ok).toBe(true);
  });

  test('normalizes official nested identifiers and terminal-backed agent identities', () => {
    const snapshot = normalizeSnapshot({
      version: '0.7.4',
      protocol: 16,
      workspaces: [{ workspace_id: 'w1', name: 'Workspace' }],
      tabs: [{ tab_id: 't1', workspace_id: 'w1', name: 'Tab' }],
      panes: [
        {
          pane_id: 'p1',
          terminal_id: 'term-1',
          tab_id: 't1',
          workspace_id: 'w1',
          agent_id: 'agent-1',
          agent_status: 'working',
        },
      ],
      agents: [{ terminal_id: 'term-1', name: 'Codex', status: 'working' }],
    });
    expect(snapshot.panes.get('p1')?.terminalId).toBe('term-1');
    expect(snapshot.agents.has('term-1')).toBe(true);
  });
});
