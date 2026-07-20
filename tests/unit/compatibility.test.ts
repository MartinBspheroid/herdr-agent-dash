import { describe, expect, test } from 'bun:test';

import type { ProcessResult, ProcessRunner } from '@/contracts';
import { checkHerdrCompatibility, MINIMUM_HERDR_VERSION } from '@/herdr/compatibility';

describe('Herdr compatibility guard', () => {
  test('accepts the manifest minimum version', async () => {
    const runner = new StaticRunner('herdr 0.7.4');
    expect(await checkHerdrCompatibility(runner, 'custom-herdr')).toBeUndefined();
    expect(runner.argv).toEqual(['custom-herdr', '--version']);
  });

  test('returns an actionable warning for an older host', async () => {
    const warning = await checkHerdrCompatibility(new StaticRunner('herdr 0.7.1'));
    expect(warning).toContain(`${MINIMUM_HERDR_VERSION}+`);
    expect(warning).toContain('too old');
  });

  test('handles missing and malformed version output safely', async () => {
    expect(await checkHerdrCompatibility(new ThrowingRunner())).toContain('Unable to verify');
    expect(await checkHerdrCompatibility(new StaticRunner('version unknown'))).toContain(
      'version is unavailable',
    );
  });
});

class StaticRunner implements ProcessRunner {
  public argv: readonly string[] = [];

  public constructor(private readonly stdout: string) {}

  public async run(argv: readonly string[]): Promise<ProcessResult> {
    this.argv = argv;
    return { exitCode: 0, stdout: this.stdout, stderr: '', timedOut: false, truncated: false };
  }
}

class ThrowingRunner implements ProcessRunner {
  public async run(): Promise<ProcessResult> {
    throw new Error('binary missing');
  }
}
