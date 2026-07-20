import type { GitContext } from '@/contracts';

/** Parsed branch and file counters from Git porcelain-v2 output. */
export interface PorcelainStatus {
  readonly upstream?: string | undefined;
  readonly ahead?: number | undefined;
  readonly behind?: number | undefined;
  readonly clean: boolean;
  readonly changedFiles: number;
  readonly staged: number;
  readonly modified: number;
  readonly deleted: number;
  readonly renamed: number;
  readonly conflicted: number;
  readonly untracked: number;
}

/** Parse branch headers and status records without interpreting file paths. */
export function parsePorcelainV2(text: string): PorcelainStatus {
  let upstream: string | undefined;
  let ahead: number | undefined;
  let behind: number | undefined;
  let staged = 0;
  let modified = 0;
  let deleted = 0;
  let renamed = 0;
  let conflicted = 0;
  let untracked = 0;
  let changedFiles = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim() || undefined;
      continue;
    }
    if (line.startsWith('# branch.ab ')) {
      const match = /^# branch\.ab \+(-?\d+) -(-?\d+)$/.exec(line);
      if (match !== null) {
        ahead = Number(match[1]);
        behind = Number(match[2]);
      }
      continue;
    }
    if (line.length === 0 || line.startsWith('# ')) continue;
    const kind = line[0];
    if (kind === '?') {
      untracked += 1;
      changedFiles += 1;
      continue;
    }
    if (kind === '2') renamed += 1;
    if (kind === 'u') conflicted += 1;
    const status = statusCode(line);
    if (status === undefined) continue;
    const index = status[0];
    const worktree = status[1];
    if (index !== '.') staged += 1;
    if (worktree !== '.') modified += 1;
    if (index === 'D' || worktree === 'D') deleted += 1;
    if (kind !== '2' && (index === 'R' || worktree === 'R')) renamed += 1;
    if (
      kind !== 'u' &&
      index !== undefined &&
      worktree !== undefined &&
      ('U'.includes(index) || 'U'.includes(worktree))
    )
      conflicted += 1;
    changedFiles += 1;
  }
  return {
    upstream,
    ahead,
    behind,
    clean: changedFiles === 0,
    changedFiles,
    staged,
    modified,
    deleted,
    renamed,
    conflicted,
    untracked,
  };
}

/** Combine Git command results into the public context shape. */
export function makeGitContext(args: {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly branch?: string | undefined;
  readonly detachedHead?: string | undefined;
  readonly status: PorcelainStatus;
  readonly refreshedAt: number;
}): GitContext {
  return {
    status: 'ready',
    repoRoot: args.repoRoot,
    repoName: basename(args.repoRoot),
    worktreePath: args.worktreePath,
    branch: args.branch,
    detachedHead: args.detachedHead,
    clean: args.status.clean,
    changedFiles: args.status.changedFiles,
    staged: args.status.staged,
    modified: args.status.modified,
    deleted: args.status.deleted,
    renamed: args.status.renamed,
    conflicted: args.status.conflicted,
    untracked: args.status.untracked,
    upstream: args.status.upstream,
    ahead: args.status.ahead,
    behind: args.status.behind,
    refreshedAt: args.refreshedAt,
  };
}

function statusCode(line: string): string | undefined {
  const fields = line.split(' ');
  return fields.length > 1 ? fields[1] : undefined;
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]$/, '');
  const slash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}
