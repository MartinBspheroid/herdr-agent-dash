import { describe, expect, test } from 'bun:test';

import { DefaultCommandService } from '@/app/command-service';
import { SystemClock } from '@/app/runtime';
import { SafeGitEnricher } from '@/git/git-enricher';
import { LiveSessionStore } from '@/herdr/session-store';
import { BoardError } from '@/app/errors';
import { fixtureSnapshot, FixtureTransport } from '@tests/fixtures/herdr';

describe('command service', () => {
  test('focuses current pane after stable terminal identity moves', async () => {
    const transport = new FixtureTransport(fixtureSnapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    await session.start();
    transport.emit('pane.updated', {
      pane: {
        id: 'p1-new',
        terminal_id: 'term-1',
        tab_id: 't1',
        workspace_id: 'w1',
        agent_id: 'a1',
        agent: 'Claude',
        agent_status: 'working',
      },
    });
    await waitFor(() => session.getSnapshot().panes.has('p1-new'));
    expect(session.getSnapshot().panes.has('p1')).toBe(false);
    const commands = new DefaultCommandService(
      session,
      transport,
      new SafeGitEnricher(new NoopRunner(), new SystemClock()),
    );
    const result = await commands.focusAgent('term-1');
    expect(result.ok).toBe(true);
    expect(transport.requests.at(-1)).toBe('agent.focus');
    expect(transport.requestCalls.at(-1)?.params).toEqual({ target: 'term-1' });
    await session.dispose();
  });

  test('loads and sanitizes output only on explicit request', async () => {
    const transport = new FixtureTransport(fixtureSnapshot);
    transport.readOutput = '\u001b[31msecret\u001b[0m';
    const session = new LiveSessionStore(transport, new SystemClock());
    await session.start();
    const before = transport.requests.filter((method) => method === 'pane.read').length;
    const commands = new DefaultCommandService(
      session,
      transport,
      new SafeGitEnricher(new NoopRunner(), new SystemClock()),
    );
    expect(transport.requests.filter((method) => method === 'pane.read').length).toBe(before);
    const result = await commands.loadRecentOutput('term-1');
    expect(result.value?.text).toBe('secret');
    expect(transport.requests.filter((method) => method === 'pane.read').length).toBe(before + 1);
    expect(transport.requestCalls.at(-1)?.params).toEqual({
      pane_id: 'p1',
      source: 'recent-unwrapped',
      lines: 30,
    });
    await session.dispose();
  });

  test('returns a focus error without closing the board', async () => {
    const transport = new FailingFocusTransport(fixtureSnapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    await session.start();
    const commands = new DefaultCommandService(
      session,
      transport,
      new SafeGitEnricher(new NoopRunner(), new SystemClock()),
      { popup: true },
    );
    const result = await commands.focusAgent('term-1');
    expect(result.ok).toBe(false);
    expect(transport.requests.includes('popup.close')).toBe(false);
    await session.dispose();
  });

  test('refreshes once and retries a stale focus target', async () => {
    const transport = new RetryFocusTransport(fixtureSnapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    await session.start();
    const commands = new DefaultCommandService(
      session,
      transport,
      new SafeGitEnricher(new NoopRunner(), new SystemClock()),
      { popup: true },
    );
    const result = await commands.focusAgent('term-1');
    expect(result.ok).toBe(true);
    expect(transport.focusCalls).toBe(2);
    expect(transport.requests.filter((method) => method === 'popup.close')).toHaveLength(1);
    await session.dispose();
  });

  test('fails closed when the refresh needed for a stale focus target fails', async () => {
    const transport = new RefreshFailingTransport(fixtureSnapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    await session.start();
    const commands = new DefaultCommandService(
      session,
      transport,
      new SafeGitEnricher(new NoopRunner(), new SystemClock()),
    );
    const result = await commands.focusAgent('term-1');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unable to refresh before retry');
    expect(transport.focusCalls).toBe(1);
    await session.dispose();
  });

  test('reports popup-close failure instead of hiding it', async () => {
    const transport = new PopupCloseFailingTransport(fixtureSnapshot);
    const session = new LiveSessionStore(transport, new SystemClock());
    await session.start();
    const commands = new DefaultCommandService(
      session,
      transport,
      new SafeGitEnricher(new NoopRunner(), new SystemClock()),
      { popup: true },
    );
    const result = await commands.focusAgent('term-1');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('popup close failed');
    await session.dispose();
  });
});

class FailingFocusTransport extends FixtureTransport {
  public override async request<T>(method: string): Promise<T> {
    if (method === 'agent.focus') throw new BoardError('focus_failed', 'focus denied');
    return await super.request<T>(method);
  }
}

class RetryFocusTransport extends FixtureTransport {
  public focusCalls = 0;

  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === 'agent.focus') {
      this.focusCalls += 1;
      if (this.focusCalls === 1) throw new BoardError('not_found', 'target moved');
    }
    return await super.request<T>(method, params);
  }
}

class RefreshFailingTransport extends FixtureTransport {
  public focusCalls = 0;
  private failRefresh = false;

  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === 'agent.focus') {
      this.focusCalls += 1;
      this.failRefresh = true;
      throw new BoardError('not_found', 'target moved');
    }
    if (method === 'session.snapshot' && this.failRefresh)
      throw new BoardError('snapshot_failed', 'host unavailable');
    return await super.request<T>(method, params);
  }
}

class PopupCloseFailingTransport extends FixtureTransport {
  public override async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === 'popup.close') throw new BoardError('popup_failed', 'popup unavailable');
    return await super.request<T>(method, params);
  }
}

class NoopRunner {
  public async run(): Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
    readonly truncated: boolean;
  }> {
    return { exitCode: 1, stdout: '', stderr: '', timedOut: false, truncated: false };
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition did not become true');
}
