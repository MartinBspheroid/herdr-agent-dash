import { describe, expect, test } from 'bun:test';

import type { ProcessOptions, ProcessResult } from '@/contracts';
import { CliHerdrTransport } from '@/herdr/cli-client';

describe('Herdr CLI transport', () => {
  test('uses the documented snapshot command', async () => {
    const runner = new RecordingRunner(JSON.stringify({ panes: [] }));
    const transport = new CliHerdrTransport(runner, '/custom/herdr');

    await transport.request<unknown>('session.snapshot');

    expect(runner.argvs[0]).toEqual(['/custom/herdr', 'api', 'snapshot']);
  });

  test('maps focus and bounded output requests to CLI helpers', async () => {
    const runner = new RecordingRunner('{}');
    const transport = new CliHerdrTransport(runner, '/custom/herdr');

    await transport.request('agent.focus', { target: 'w1:p2' });
    await transport.request('pane.read', { pane_id: 'p2', lines: 500 });

    expect(runner.argvs).toEqual([
      ['/custom/herdr', 'agent', 'focus', 'w1:p2'],
      ['/custom/herdr', 'pane', 'read', 'p2', '--source', 'recent-unwrapped', '--lines', '200'],
    ]);
  });

  test('returns CLI output as text for output reads', async () => {
    const runner = new RecordingRunner('recent output');
    const transport = new CliHerdrTransport(runner, '/custom/herdr');

    const output = await transport.request<string>('pane.read', { pane_id: 'p1' });

    expect(output).toBe('recent output');
  });
});

class RecordingRunner {
  public readonly argvs: Array<readonly string[]> = [];

  public constructor(private readonly stdout: string) {}

  public async run(argv: readonly string[], _options?: ProcessOptions): Promise<ProcessResult> {
    this.argvs.push(argv);
    return {
      exitCode: 0,
      stdout: this.stdout,
      stderr: '',
      timedOut: false,
      truncated: false,
    };
  }
}
