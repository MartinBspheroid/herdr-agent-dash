import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';

import { BunProcessRunner, SystemClock } from '@/app/runtime';
import type { ProcessOptions, ProcessResult, ProcessRunner } from '@/contracts';
import { SafeGitEnricher } from '@/git/git-enricher';
import {
  CountingTimeoutRunner,
  ThrowingRunner,
  TimeoutRunner,
} from '@tests/fixtures/process-runners';
import {
  createFixtureFile,
  createTempDirectory,
  removeTempDirectory,
} from '@tests/fixtures/helpers';

describe('safe Git enricher', () => {
  test('resolves a temporary repository and untracked status without shell interpolation', async () => {
    const directory = await createTempDirectory('herdr-board-git');
    const runner = new BunProcessRunner();
    try {
      const init = await runner.run(['git', 'init', '-q', '-b', 'main', directory]);
      expect(init.exitCode).toBe(0);
      await createFixtureFile(directory, 'file with spaces.txt', 'fixture');
      const enricher = new SafeGitEnricher(runner, new SystemClock());
      const context = await enricher.ensure(directory, 'startup');
      expect(context.status).toBe('ready');
      expect(context.repoRoot).toBe(await realpath(directory));
      expect(context.branch).toBe('main');
      expect(context.untracked).toBe(1);
      await enricher.dispose();
    } finally {
      await removeTempDirectory(directory);
    }
  });

  test('returns neutral not-Git state for a plain directory', async () => {
    const directory = await createTempDirectory('herdr-board-no-git');
    try {
      const context = await new SafeGitEnricher(new BunProcessRunner(), new SystemClock()).ensure(
        directory,
        'startup',
      );
      expect(context.status).toBe('not_git');
    } finally {
      await removeTempDirectory(directory);
    }
  });

  test('returns a neutral result for a deleted working directory', async () => {
    const directory = await createTempDirectory('herdr-board-deleted-cwd');
    await removeTempDirectory(directory);
    const context = await new SafeGitEnricher(new BunProcessRunner(), new SystemClock()).ensure(
      directory,
      'startup',
    );
    expect(context.status).toBe('not_git');
  });

  test('reuses cached repository context and refreshes after invalidation', async () => {
    const directory = await createTempDirectory('herdr-board-git-cache');
    const runner = new CountingRunner(new BunProcessRunner());
    try {
      const init = await runner.run(['git', 'init', '-q', '-b', 'main', directory]);
      expect(init.exitCode).toBe(0);
      const enricher = new SafeGitEnricher(runner, new SystemClock());
      await enricher.ensure(directory, 'startup');
      const afterStartup = runner.calls;

      await enricher.ensure(`${directory}/nested`, 'herdr_event');
      expect(runner.calls).toBe(afterStartup);
      expect(enricher.get(`${directory}/nested`)?.repoRoot).toBe(await realpath(directory));

      const beforeConcurrent = runner.calls;
      await Promise.all([
        enricher.ensure(directory, 'manual'),
        enricher.ensure(directory, 'manual'),
      ]);
      expect(runner.calls - beforeConcurrent).toBe(4);

      enricher.invalidate(directory, 'manual');
      await enricher.ensure(directory, 'manual');
      expect(runner.calls).toBeGreaterThan(afterStartup);
      await enricher.dispose();
    } finally {
      await removeTempDirectory(directory);
    }
  });

  test('reports detached and unborn branch states without crashing', async () => {
    const detachedDirectory = await createTempDirectory('herdr-board-git-detached');
    const unbornDirectory = await createTempDirectory('herdr-board-git-unborn');
    const runner = new BunProcessRunner();
    try {
      expect(
        (await runner.run(['git', 'init', '-q', '-b', 'main', detachedDirectory])).exitCode,
      ).toBe(0);
      expect(
        (
          await runner.run([
            'git',
            '-C',
            detachedDirectory,
            '-c',
            'user.name=Herdr Test',
            '-c',
            'user.email=herdr@example.test',
            'commit',
            '--allow-empty',
            '-qm',
            'initial',
          ])
        ).exitCode,
      ).toBe(0);
      expect(
        (await runner.run(['git', '-C', detachedDirectory, 'checkout', '-q', '--detach'])).exitCode,
      ).toBe(0);
      const detached = new SafeGitEnricher(runner, new SystemClock());
      const detachedContext = await detached.ensure(detachedDirectory, 'startup');
      expect(detachedContext.branch).toBeUndefined();
      expect(detachedContext.detachedHead).toMatch(/^[0-9a-f]+$/u);
      await detached.dispose();

      expect(
        (await runner.run(['git', 'init', '-q', '-b', 'main', unbornDirectory])).exitCode,
      ).toBe(0);
      const unborn = new SafeGitEnricher(runner, new SystemClock());
      const unbornContext = await unborn.ensure(unbornDirectory, 'startup');
      expect(unbornContext.status).toBe('ready');
      expect(unbornContext.branch).toBe('main');
      expect(unbornContext.detachedHead).toBeUndefined();
      await unborn.dispose();
    } finally {
      await removeTempDirectory(detachedDirectory);
      await removeTempDirectory(unbornDirectory);
    }
  });

  test('handles Unicode, spaces, and leading-hyphen directories through argv', async () => {
    const directory = await createTempDirectory('herdr-board-git-paths');
    const nested = join(directory, '-leading', 'spaced équipe');
    try {
      await mkdir(nested, { recursive: true });
      const runner = new BunProcessRunner();
      expect((await runner.run(['git', 'init', '-q', '-b', 'main', directory])).exitCode).toBe(0);
      const context = await new SafeGitEnricher(runner, new SystemClock()).ensure(
        nested,
        'startup',
      );
      expect(context.status).toBe('ready');
      expect(context.worktreePath).toBe(nested);
    } finally {
      await removeTempDirectory(directory);
    }
  });

  test('returns a bounded timeout context when Git does not respond', async () => {
    const context = await new SafeGitEnricher(new TimeoutRunner(), new SystemClock()).ensure(
      '/tmp/timeout-fixture',
      'startup',
    );
    expect(context.status).toBe('error');
    expect(context.errorCode).toBe('timeout');
  });

  test('keeps a missing Git executable local to the affected context', async () => {
    const context = await new SafeGitEnricher(new ThrowingRunner(), new SystemClock()).ensure(
      '/tmp/missing-git-fixture',
      'startup',
    );
    expect(context.status).toBe('error');
    expect(context.errorCode).toBe('git_unavailable');
  });

  test('does not report a failed status command as a clean repository', async () => {
    const runner = new ScriptedGitRunner({ statusExitCode: 1 });
    const context = await new SafeGitEnricher(runner, new SystemClock()).ensure(
      '/tmp/repository',
      'startup',
    );
    expect(context.status).toBe('error');
    expect(context.errorCode).toBe('git_command_failed');
  });

  test('reports truncated Git output as an error', async () => {
    const runner = new ScriptedGitRunner({ statusTruncated: true });
    const context = await new SafeGitEnricher(runner, new SystemClock()).ensure(
      '/tmp/repository',
      'startup',
    );
    expect(context.status).toBe('error');
    expect(context.errorCode).toBe('output_truncated');
  });

  test('encodes the untracked-file policy explicitly', async () => {
    const runner = new ScriptedGitRunner({});
    await new SafeGitEnricher(runner, new SystemClock(), { includeUntracked: false }).ensure(
      '/tmp/repository',
      'startup',
    );
    const statusCommand = runner.commands.find((command) => command.includes('status'));
    expect(statusCommand).toContain('--untracked-files=no');
  });

  test('evicts the oldest cache entries after the configured bound', async () => {
    const runner = new VariableGitRunner();
    const enricher = new SafeGitEnricher(runner, new SystemClock(), { maxCacheEntries: 2 });
    await enricher.ensure('/tmp/repository-a', 'startup');
    await enricher.ensure('/tmp/repository-b', 'startup');
    await enricher.ensure('/tmp/repository-c', 'startup');
    expect(enricher.get('/tmp/repository-a')).toBeUndefined();
    expect(enricher.get('/tmp/repository-c')?.status).toBe('ready');
    expect(enricher.getDiagnostics?.().cacheEntries).toBeLessThanOrEqual(2);
    await enricher.dispose();
  });

  test('does not cache a result that completes after invalidation', async () => {
    const runner = new GenerationGitRunner();
    const enricher = new SafeGitEnricher(runner, new SystemClock());
    const first = enricher.ensure('/tmp/repository', 'startup');
    await waitFor(() => runner.statusCalls === 1, 20, 1);
    enricher.invalidate('/tmp/repository', 'manual');
    const second = enricher.ensure('/tmp/repository', 'manual');
    await waitFor(() => runner.statusCalls === 2, 20, 1);
    runner.resolveStatus(1, result({ stdout: '# branch.oid new\n# branch.head main\n' }));
    runner.resolveStatus(0, result({ stdout: '# branch.oid old\n# branch.head main\n' }));
    const [oldResult, newResult] = await Promise.all([first, second]);
    expect(oldResult.status).toBe('stale');
    expect(newResult.status).toBe('ready');
    expect(enricher.get('/tmp/repository')?.status).toBe('ready');
    await enricher.dispose();
  });

  test('watchdog refreshes cached paths on a bounded interval', async () => {
    const directory = await createTempDirectory('herdr-board-git-watchdog');
    const runner = new CountingRunner(new BunProcessRunner());
    try {
      expect((await runner.run(['git', 'init', '-q', '-b', 'main', directory])).exitCode).toBe(0);
      const enricher = new SafeGitEnricher(runner, new SystemClock());
      await enricher.ensure(directory, 'startup');
      const beforeWatchdog = runner.calls;
      enricher.startWatchdog?.([directory], 10);
      await waitFor(() => runner.calls > beforeWatchdog, 50, 10);
      await enricher.dispose();
      expect(runner.calls).toBeGreaterThan(beforeWatchdog);
    } finally {
      await removeTempDirectory(directory);
    }
  });

  test('backs off repeated watchdog timeouts', async () => {
    const runner = new CountingTimeoutRunner();
    const enricher = new SafeGitEnricher(runner, new SystemClock());
    await enricher.ensure('/tmp/repeated-timeout', 'startup');
    enricher.startWatchdog?.(['/tmp/repeated-timeout'], 5);
    await waitFor(() => runner.calls >= 2, 20, 5);
    const afterFirstWatchdog = runner.calls;
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(runner.calls).toBe(afterFirstWatchdog);
    await enricher.dispose();
  });

  test('debounces repeated invalidation notifications', async () => {
    const enricher = new SafeGitEnricher(new TimeoutRunner(), new SystemClock());
    let notifications = 0;
    enricher.subscribe(() => {
      notifications += 1;
    });
    enricher.invalidate('/tmp/repeated', 'herdr_event');
    enricher.invalidate('/tmp/repeated', 'herdr_event');
    enricher.invalidate('/tmp/repeated', 'herdr_event');
    await waitFor(() => notifications === 1, 20, 10);
    expect(notifications).toBe(1);
    await enricher.dispose();
  });
});

class CountingRunner implements ProcessRunner {
  public calls = 0;

  public constructor(private readonly delegate: ProcessRunner) {}

  public async run(argv: readonly string[], options?: ProcessOptions): Promise<ProcessResult> {
    this.calls += 1;
    return await this.delegate.run(argv, options);
  }
}

class ScriptedGitRunner implements ProcessRunner {
  public readonly commands: string[][] = [];

  public constructor(
    private readonly options: {
      readonly statusExitCode?: number;
      readonly statusTruncated?: boolean;
    },
  ) {}

  public async run(argv: readonly string[]): Promise<ProcessResult> {
    this.commands.push([...argv]);
    const command = argv.join(' ');
    if (command.includes('rev-parse --show-toplevel'))
      return result({ stdout: '/tmp/repository\n' });
    if (command.includes('branch --show-current')) return result({ stdout: 'main\n' });
    if (command.includes('rev-parse --short HEAD')) return result({ stdout: 'abc123\n' });
    return result({
      exitCode: this.options.statusExitCode ?? 0,
      truncated: this.options.statusTruncated ?? false,
      stdout: '# branch.oid abc123\n# branch.head main\n',
    });
  }
}

class VariableGitRunner implements ProcessRunner {
  public async run(argv: readonly string[]): Promise<ProcessResult> {
    const cwd = argv[2] ?? '/tmp/repository';
    const command = argv.join(' ');
    if (command.includes('rev-parse --show-toplevel')) return result({ stdout: `${cwd}\n` });
    if (command.includes('branch --show-current')) return result({ stdout: 'main\n' });
    if (command.includes('rev-parse --short HEAD')) return result({ stdout: 'abc123\n' });
    return result({ stdout: '# branch.oid abc123\n# branch.head main\n' });
  }
}

class GenerationGitRunner implements ProcessRunner {
  public statusCalls = 0;
  private readonly statusResolvers: Array<(value: ProcessResult) => void> = [];

  public async run(argv: readonly string[]): Promise<ProcessResult> {
    const command = argv.join(' ');
    if (command.includes('rev-parse --show-toplevel'))
      return result({ stdout: '/tmp/repository\n' });
    if (command.includes('branch --show-current')) return result({ stdout: 'main\n' });
    if (command.includes('rev-parse --short HEAD')) return result({ stdout: 'abc123\n' });
    this.statusCalls += 1;
    return await new Promise<ProcessResult>((resolve) => this.statusResolvers.push(resolve));
  }

  public resolveStatus(index: number, value: ProcessResult): void {
    this.statusResolvers[index]?.(value);
  }
}

function result(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    truncated: false,
    ...overrides,
  };
}

async function waitFor(predicate: () => boolean, attempts: number, delay: number): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('condition did not become true');
}
