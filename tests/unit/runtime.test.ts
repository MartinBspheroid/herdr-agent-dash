import { describe, expect, test } from 'bun:test';

import { BunProcessRunner } from '@/app/runtime';

describe('Bun process runner', () => {
  test('enforces a hard timeout for a process that ignores the first termination signal', async () => {
    const startedAt = Date.now();
    const result = await new BunProcessRunner().run(
      ['sh', '-c', 'trap "" TERM; while true; do :; done'],
      { timeoutMs: 25, maxOutputBytes: 1_024 },
    );
    expect(result.timedOut).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  test('reads bounded stdout while the process is still running', async () => {
    const result = await new BunProcessRunner().run(
      ['sh', '-c', 'i=0; while [ "$i" -lt 10000 ]; do printf x; i=$((i+1)); done'],
      { timeoutMs: 500, maxOutputBytes: 128 },
    );
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(128);
  });
});
