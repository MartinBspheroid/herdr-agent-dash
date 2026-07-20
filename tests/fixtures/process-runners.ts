import type { ProcessOptions, ProcessResult, ProcessRunner } from '@/contracts';

/** Process runner fixture that simulates a bounded Git timeout. */
export class TimeoutRunner implements ProcessRunner {
  public async run(_argv: readonly string[], _options?: ProcessOptions): Promise<ProcessResult> {
    return {
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: true,
      truncated: false,
    };
  }
}

/** Timeout fixture that records how often a watchdog invokes it. */
export class CountingTimeoutRunner extends TimeoutRunner {
  public calls = 0;

  public override async run(
    argv: readonly string[],
    options?: ProcessOptions,
  ): Promise<ProcessResult> {
    this.calls += 1;
    return await super.run(argv, options);
  }
}

/** Process runner fixture that simulates a missing executable. */
export class ThrowingRunner implements ProcessRunner {
  public async run(): Promise<ProcessResult> {
    throw new Error('git executable missing');
  }
}
