import { describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { BunProcessRunner, SystemClock } from '@/app/runtime';
import { SafeGitEnricher } from '@/git/git-enricher';
import {
  createFixtureFile,
  createTempDirectory,
  removeTempDirectory,
} from '@tests/fixtures/helpers';

describe('Git linked worktree enrichment', () => {
  test('resolves a linked worktree as its own repository context', async () => {
    const directory = await createTempDirectory('herdr-board-git-worktree');
    const linked = join(directory, 'linked worktree');
    const runner = new BunProcessRunner();
    try {
      expect((await runner.run(['git', 'init', '-q', '-b', 'main', directory])).exitCode).toBe(0);
      await createFixtureFile(directory, 'tracked.txt', 'fixture');
      expect((await runner.run(['git', '-C', directory, 'add', 'tracked.txt'])).exitCode).toBe(0);
      expect(
        (
          await runner.run([
            'git',
            '-C',
            directory,
            '-c',
            'user.name=Herdr Test',
            '-c',
            'user.email=herdr@example.test',
            'commit',
            '-qm',
            'initial',
          ])
        ).exitCode,
      ).toBe(0);
      expect(
        (await runner.run(['git', '-C', directory, 'branch', 'feature/worktree'])).exitCode,
      ).toBe(0);
      expect(
        (
          await runner.run([
            'git',
            '-C',
            directory,
            'worktree',
            'add',
            '-q',
            linked,
            'feature/worktree',
          ])
        ).exitCode,
      ).toBe(0);
      const enricher = new SafeGitEnricher(runner, new SystemClock());
      const context = await enricher.ensure(linked, 'startup');
      expect(context.status).toBe('ready');
      expect(context.branch).toBe('feature/worktree');
      expect(context.repoRoot).toBe(await realpath(linked));
      await enricher.dispose();
      await runner.run(['git', '-C', directory, 'worktree', 'remove', '--force', linked]);
    } finally {
      await removeTempDirectory(directory);
    }
  });
});
