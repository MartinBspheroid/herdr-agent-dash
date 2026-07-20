import type { HerdrTransport } from '@/contracts';
import { AsyncQueue } from '@/herdr/async-queue';

/** Minimal fixture snapshot containing two agents and one malformed record. */
export const fixtureSnapshot = {
  version: '0.7.4',
  protocol: 16,
  workspaces: [{ id: 'w1', label: 'Workspace', cwd: '/tmp/project' }],
  tabs: [{ id: 't1', workspace_id: 'w1', label: 'Main' }],
  panes: [
    {
      id: 'p1',
      terminal_id: 'term-1',
      tab_id: 't1',
      workspace_id: 'w1',
      agent_id: 'a1',
      agent: 'Claude',
      provider: 'claude',
      agent_status: 'working',
      cwd: '/tmp/project',
      foreground_cwd: '/tmp/project',
      terminal_title_stripped: 'running tests',
      focused: true,
      metadata: { summary: 'Reviewing cache' },
    },
    {
      id: 'p2',
      terminal_id: 'term-2',
      tab_id: 't1',
      workspace_id: 'w1',
      agent_id: 'a2',
      agent: 'Codex',
      provider: 'codex',
      agent_status: 'blocked',
      cwd: '/tmp/project',
      metadata: { state_message: 'Approval requested' },
      focused: false,
    },
    { invalid: true },
  ],
  agents: [
    { id: 'a1', name: 'Claude', provider: 'claude', status: 'working' },
    { id: 'a2', name: 'Codex', provider: 'codex', status: 'blocked' },
    { invalid: true },
  ],
} as const;

/** Scriptable in-memory transport for reducer and reconnect integration tests. */
export class FixtureTransport implements HerdrTransport {
  public readonly events = new AsyncQueue<{ readonly event: string; readonly payload: unknown }>();
  public readonly requests: string[] = [];
  public readonly requestCalls: Array<{ readonly method: string; readonly params: unknown }> = [];
  public subscribeCalls = 0;
  public closed = false;
  public readOutput = '';

  /** Create a transport that serves the supplied snapshot. */
  public constructor(private readonly snapshot: unknown) {}

  /** Return fixture data for session snapshot and acknowledge all other requests. */
  public async request<T>(method: string, params?: unknown): Promise<T> {
    this.requests.push(method);
    this.requestCalls.push({ method, params });
    if (method === 'session.snapshot') return this.snapshot as T;
    if (method === 'pane.read') return this.readOutput as T;
    return {} as T;
  }

  /** Expose the shared fixture event queue. */
  public async subscribe(): Promise<
    AsyncIterable<{ readonly event: string; readonly payload: unknown }>
  > {
    this.subscribeCalls += 1;
    return this.events;
  }

  /** Close the queue and mark the fake transport closed. */
  public async close(): Promise<void> {
    this.closed = true;
    this.events.close();
  }

  /** Emit a fixture event to the live store. */
  public emit(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}
