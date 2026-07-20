import { describe, expect, test } from 'bun:test';

import { parsePorcelainV2 } from '@/git/porcelain-v2';

describe('Git porcelain-v2 parser', () => {
  test('counts staged, modified, renamed, conflict, and untracked records', () => {
    const parsed = parsePorcelainV2(
      [
        '# branch.head feature/test',
        '# branch.upstream origin/feature/test',
        '# branch.ab +2 -1',
        '1 M. N... 100644 100644 100644 abc def file.ts',
        '1 .D N... 100644 100644 000000 abc 000 deleted.ts',
        '2 R. N... 100644 100644 100644 abc def R100 renamed.ts\toriginal.ts',
        'u UU N... 100644 100644 100644 100644 abc def ghi jkl conflict.ts',
        '? untracked.txt',
      ].join('\n'),
    );
    expect(parsed.upstream).toBe('origin/feature/test');
    expect(parsed.ahead).toBe(2);
    expect(parsed.behind).toBe(1);
    expect(parsed.changedFiles).toBe(5);
    expect(parsed.staged).toBe(3);
    expect(parsed.modified).toBe(2);
    expect(parsed.deleted).toBe(1);
    expect(parsed.renamed).toBe(1);
    expect(parsed.conflicted).toBe(1);
    expect(parsed.untracked).toBe(1);
  });

  test('recognizes a clean status', () => {
    expect(parsePorcelainV2('# branch.head main\n').clean).toBe(true);
  });
});
