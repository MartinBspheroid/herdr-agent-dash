import { isAbsolute, relative, resolve } from 'node:path';

import type { Clock, GitContext, ProcessRunner } from '@/contracts';
import { makeGitContext, parsePorcelainV2 } from '@/git/porcelain-v2';

/** Why a repository status refresh was requested. */
export type GitRefreshReason = 'startup' | 'cwd_changed' | 'herdr_event' | 'watchdog' | 'manual';

/** Public asynchronous Git enrichment boundary. */
export interface GitEnricher {
  get(cwd: string): GitContext | undefined;
  ensure(cwd: string, reason: GitRefreshReason): Promise<GitContext>;
  invalidate(cwdOrRepo: string, reason: GitRefreshReason): void;
  subscribe(listener: (key: string) => void): () => void;
  startWatchdog?(cwds: readonly string[], intervalMs: number): void;
  dispose(): Promise<void>;
  getDiagnostics?(): GitDiagnostics;
}

/** In-memory Git resource counters safe to expose to diagnostics. */
export interface GitDiagnostics {
  readonly cacheEntries: number;
  readonly inflightEntries: number;
  readonly activeProcesses: number;
  readonly watchdogPaths: number;
  readonly disposed: boolean;
}

const NOT_GIT: GitContext = { status: 'not_git', errorCode: 'not_git' };
const ERROR_CONTEXT: GitContext = { status: 'error', errorCode: 'git_unavailable' };
const INVALIDATION_DEBOUNCE_MS = 25;
const MAX_WATCHDOG_BACKOFF_MS = 300_000;

/** No-op enrichment used when configuration explicitly disables Git. */
export class DisabledGitEnricher implements GitEnricher {
  /** Return a stable diagnostic without starting a subprocess. */
  public get(_cwd: string): GitContext {
    return { status: 'error', errorCode: 'disabled' };
  }

  /** Return the same disabled diagnostic for every directory. */
  public async ensure(_cwd: string, _reason: GitRefreshReason): Promise<GitContext> {
    return this.get(_cwd);
  }

  /** Ignore invalidation because no Git cache exists. */
  public invalidate(_cwdOrRepo: string, _reason: GitRefreshReason): void {}

  /** Provide a no-op subscription teardown. */
  public subscribe(_listener: (key: string) => void): () => void {
    return () => undefined;
  }

  /** Release no resources. */
  public async dispose(): Promise<void> {}

  /** Return the disabled provider health state. */
  public getDiagnostics(): GitDiagnostics {
    return {
      cacheEntries: 0,
      inflightEntries: 0,
      activeProcesses: 0,
      watchdogPaths: 0,
      disposed: false,
    };
  }
}

/** Safe, cached, concurrency-limited Git context provider. */
export class SafeGitEnricher implements GitEnricher {
  private readonly cache = new Map<string, GitContext>();
  private readonly inflight = new Map<string, Promise<GitContext>>();
  private readonly listeners = new Set<(key: string) => void>();
  private readonly invalidationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly watchdogBackoff = new Map<string, { failures: number; nextAt: number }>();
  private readonly generations = new Map<string, number>();
  private active = 0;
  private disposed = false;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private watchdogPaths = new Set<string>();

  /** Create an enricher with explicit process and time dependencies. */
  public constructor(
    private readonly runner: ProcessRunner,
    private readonly clock: Clock,
    private readonly options: {
      readonly timeoutMs?: number;
      readonly maxConcurrency?: number;
      readonly includeUntracked?: boolean;
      readonly maxCacheEntries?: number;
    } = {},
  ) {}

  /** Return cached context without starting I/O. */
  public get(cwd: string): GitContext | undefined {
    const key = normalizePath(cwd);
    const direct = this.cache.get(key);
    if (direct !== undefined) return direct;
    return [...this.cache.values()]
      .filter(
        (context): context is GitContext & { readonly repoRoot: string } =>
          context.repoRoot !== undefined && isWithinRoot(key, normalizePath(context.repoRoot)),
      )
      .toSorted((left, right) => right.repoRoot.length - left.repoRoot.length)[0];
  }

  /** Resolve and cache repository context without blocking board rendering. */
  public async ensure(cwd: string, reason: GitRefreshReason): Promise<GitContext> {
    const key = normalizePath(cwd);
    const generation = this.generations.get(key) ?? 0;
    const existing = this.inflight.get(key);
    if (existing !== undefined) return existing;
    const cached = this.get(cwd);
    const backoff = this.watchdogBackoff.get(key);
    if (reason === 'watchdog' && backoff !== undefined && backoff.nextAt > this.clock.now())
      return cached ?? ERROR_CONTEXT;
    if (cached !== undefined && reason !== 'watchdog' && reason !== 'manual') return cached;
    const task = this.enqueue(cwd);
    this.inflight.set(key, task);
    try {
      const result = await task;
      if (generation !== (this.generations.get(key) ?? 0)) {
        return { ...result, status: 'stale', errorCode: 'invalidated' };
      }
      const changed = this.cacheContext(key, result);
      this.recordWatchdogResult(key, reason, result);
      if (reason === 'watchdog' && changed) {
        for (const listener of this.listeners) listener(key);
      }
      return result;
    } finally {
      if (this.inflight.get(key) === task) this.inflight.delete(key);
    }
  }

  /** Invalidate one working directory or repository cache entry. */
  public invalidate(cwdOrRepo: string, _reason: GitRefreshReason): void {
    const key = normalizePath(cwdOrRepo);
    const invalidatedKeys = new Set<string>([key]);
    for (const [cachedKey, context] of this.cache.entries()) {
      const repoRoot = context.repoRoot === undefined ? undefined : normalizePath(context.repoRoot);
      if (
        cachedKey === key ||
        repoRoot === key ||
        (repoRoot !== undefined && isWithinRoot(key, repoRoot))
      ) {
        invalidatedKeys.add(cachedKey);
        this.cache.delete(cachedKey);
      }
    }
    for (const invalidatedKey of invalidatedKeys) {
      this.generations.set(invalidatedKey, (this.generations.get(invalidatedKey) ?? 0) + 1);
      this.inflight.delete(invalidatedKey);
    }
    const previousTimer = this.invalidationTimers.get(key);
    if (previousTimer !== undefined) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      this.invalidationTimers.delete(key);
      if (this.disposed) return;
      for (const listener of this.listeners) listener(key);
    }, INVALIDATION_DEBOUNCE_MS);
    this.invalidationTimers.set(key, timer);
  }

  /** Subscribe to invalidation and refresh notifications. */
  public subscribe(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start the bounded status watchdog explicitly. */
  public startWatchdog(cwds: readonly string[], intervalMs: number): void {
    this.watchdogPaths = new Set(cwds.map(normalizePath));
    if (this.watchdog !== undefined) return;
    this.watchdog = setInterval(() => {
      for (const cwd of this.watchdogPaths) void this.ensure(cwd, 'watchdog');
    }, intervalMs);
  }

  /** Stop watchdog timers and prevent new refresh work. */
  public async dispose(): Promise<void> {
    this.disposed = true;
    if (this.watchdog !== undefined) clearInterval(this.watchdog);
    for (const timer of this.invalidationTimers.values()) clearTimeout(timer);
    this.invalidationTimers.clear();
    this.watchdogBackoff.clear();
    await Promise.all(
      [...this.inflight.values()].map(async (task) => task.catch(() => ERROR_CONTEXT)),
    );
  }

  /** Return bounded cache and process state without exposing repository paths. */
  public getDiagnostics(): GitDiagnostics {
    return {
      cacheEntries: this.cache.size,
      inflightEntries: this.inflight.size,
      activeProcesses: this.active,
      watchdogPaths: this.watchdogPaths.size,
      disposed: this.disposed,
    };
  }

  private async enqueue(cwd: string): Promise<GitContext> {
    while (this.active >= (this.options.maxConcurrency ?? 4)) await wait(5);
    if (this.disposed) return ERROR_CONTEXT;
    this.active += 1;
    try {
      let result: GitContext;
      try {
        result = await this.resolve(cwd);
      } catch {
        result = ERROR_CONTEXT;
      }
      return result;
    } finally {
      this.active -= 1;
    }
  }

  private async resolve(cwd: string): Promise<GitContext> {
    const rootResult = await this.git(cwd, ['rev-parse', '--show-toplevel']);
    if (rootResult.timedOut || rootResult.truncated)
      return { ...ERROR_CONTEXT, errorCode: rootResult.timedOut ? 'timeout' : 'output_truncated' };
    if (rootResult.exitCode !== 0)
      return rootResult.timedOut ? { ...ERROR_CONTEXT, errorCode: 'timeout' } : NOT_GIT;
    const repoRoot = rootResult.stdout.trim();
    if (repoRoot.length === 0) return NOT_GIT;
    const [branchResult, headResult, statusResult] = await Promise.all([
      this.git(repoRoot, ['branch', '--show-current']),
      this.git(repoRoot, ['rev-parse', '--short', 'HEAD']),
      this.git(repoRoot, [
        'status',
        '--porcelain=v2',
        '--branch',
        this.options.includeUntracked === false
          ? '--untracked-files=no'
          : '--untracked-files=normal',
      ]),
    ]);
    if (statusResult.timedOut || branchResult.timedOut || headResult.timedOut)
      return { ...ERROR_CONTEXT, errorCode: 'timeout', repoRoot };
    if (statusResult.truncated || branchResult.truncated || headResult.truncated)
      return { ...ERROR_CONTEXT, errorCode: 'output_truncated', repoRoot };
    const branch = branchResult.stdout.trim();
    if (branchResult.exitCode !== 0 || (headResult.exitCode !== 0 && branch.length === 0))
      return { ...ERROR_CONTEXT, errorCode: 'git_command_failed', repoRoot };
    if (statusResult.exitCode !== 0)
      return { ...ERROR_CONTEXT, errorCode: 'git_command_failed', repoRoot };
    const detachedHead = branch.length === 0 ? headResult.stdout.trim() || undefined : undefined;
    const status = parsePorcelainV2(statusResult.stdout);
    return makeGitContext({
      repoRoot,
      worktreePath: cwd,
      branch: branch || undefined,
      detachedHead,
      status,
      refreshedAt: this.clock.now(),
    });
  }

  private recordWatchdogResult(key: string, reason: GitRefreshReason, result: GitContext): void {
    if (reason !== 'watchdog') {
      if (result.status === 'ready') this.watchdogBackoff.delete(key);
      return;
    }
    if (result.errorCode !== 'timeout' && result.status !== 'error') {
      this.watchdogBackoff.delete(key);
      return;
    }
    const failures = (this.watchdogBackoff.get(key)?.failures ?? 0) + 1;
    const delay = Math.min(MAX_WATCHDOG_BACKOFF_MS, 1_000 * 2 ** (failures - 1));
    this.watchdogBackoff.set(key, { failures, nextAt: this.clock.now() + delay });
  }

  private async git(cwd: string, args: readonly string[]) {
    return this.runner.run(['git', '-C', cwd, ...args], {
      timeoutMs: this.options.timeoutMs ?? 1_500,
      maxOutputBytes: 64 * 1024,
    });
  }

  private cacheContext(key: string, result: GitContext): boolean {
    const previous = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, result);
    if (result.repoRoot !== undefined) {
      const repoRoot = normalizePath(result.repoRoot);
      this.cache.delete(repoRoot);
      this.cache.set(repoRoot, result);
    }
    const maxEntries = this.options.maxCacheEntries ?? 256;
    while (this.cache.size > maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return previous !== result;
  }
}

function normalizePath(path: string): string {
  return path.replace(/[\\/]$/, '') || path;
}

function isWithinRoot(path: string, root: string): boolean {
  const relativePath = relative(canonicalPath(root), canonicalPath(path));
  return relativePath.length === 0 || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  if (process.platform === 'darwin' && resolved.startsWith('/private/'))
    return resolved.slice('/private'.length);
  return resolved;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
