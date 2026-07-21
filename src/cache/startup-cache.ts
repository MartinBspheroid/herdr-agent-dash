import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ActivitySignal, AgentCard, AgentState, GitContext } from '@/contracts';
import { errorMessage } from '@/app/errors';
import { isRecord } from '@/config/validation';

const CACHE_VERSION = 1;
const MAX_CACHE_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 512;

/** Resource bounds for the optional startup display cache. */
export interface StartupCacheOptions {
  readonly maxAgeMs: number;
  readonly maxCards: number;
}

/** Short-lived, sanitized display-card cache used only while live state starts. */
export class JsonStartupCache {
  private lastError: string | undefined;
  /** Create a cache with an explicit path, lifetime, and row bound. */
  public constructor(
    private readonly path: string,
    private readonly options: StartupCacheOptions,
  ) {}

  /** Load valid unexpired rows as stale display data without throwing. */
  public async load(now: number): Promise<readonly AgentCard[]> {
    try {
      const text = await readFile(this.path, 'utf8');
      if (Buffer.byteLength(text, 'utf8') > MAX_CACHE_BYTES) return [];
      const value: unknown = JSON.parse(text);
      if (!isRecord(value) || value.version !== CACHE_VERSION) return [];
      const savedAt = finiteNumber(value.savedAt);
      if (savedAt === undefined || now - savedAt > this.options.maxAgeMs || now < savedAt)
        return [];
      if (!Array.isArray(value.cards)) return [];
      return value.cards
        .slice(0, this.options.maxCards)
        .map(parseCachedCard)
        .filter((card): card is AgentCard => card !== undefined);
    } catch (error) {
      this.lastError = errorMessage(error);
      return [];
    }
  }

  /** Atomically persist only bounded display fields needed for the next first paint. */
  public async save(cards: readonly AgentCard[], now: number): Promise<void> {
    const payload = {
      version: CACHE_VERSION,
      savedAt: now,
      cards: cards.slice(0, this.options.maxCards).map(serializeCard),
    } as const;
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.path);
      this.lastError = undefined;
    } catch (error) {
      this.lastError = errorMessage(error);
    }
  }

  /** Return the most recent cache I/O failure without exposing cached content. */
  public getLastError(): string | undefined {
    return this.lastError;
  }
}

function serializeCard(card: AgentCard): Readonly<Record<string, unknown>> {
  return {
    id: boundedString(card.id),
    terminalId: optionalBoundedString(card.terminalId),
    agent: boundedString(card.agent),
    displayName: boundedString(card.displayName),
    provider: optionalBoundedString(card.provider),
    state: card.state,
    stateSince: card.stateSince,
    workspaceLabel: optionalBoundedString(card.workspaceLabel),
    tabLabel: optionalBoundedString(card.tabLabel),
    paneLabel: optionalBoundedString(card.paneLabel),
    effectiveCwd: optionalBoundedString(card.effectiveCwd),
    git: serializeGit(card.git),
    currentSignal: serializeSignal(card.activity.currentSignal),
  };
}

function parseCachedCard(value: unknown): AgentCard | undefined {
  if (!isRecord(value)) return undefined;
  const id = requiredString(value.id);
  const agent = requiredString(value.agent);
  const displayName = requiredString(value.displayName);
  const state = agentState(value.state);
  if (id === undefined || agent === undefined || displayName === undefined || state === undefined)
    return undefined;
  const signal = parseSignal(value.currentSignal);
  const terminalId = requiredString(value.terminalId);
  const provider = requiredString(value.provider);
  const stateSince = finiteNumber(value.stateSince);
  const workspaceLabel = requiredString(value.workspaceLabel);
  const tabLabel = requiredString(value.tabLabel);
  const paneLabel = requiredString(value.paneLabel);
  const effectiveCwd = requiredString(value.effectiveCwd);
  return {
    id,
    ...(terminalId === undefined ? {} : { terminalId }),
    agent,
    displayName,
    ...(provider === undefined ? {} : { provider }),
    state,
    ...(stateSince === undefined ? {} : { stateSince }),
    focused: false,
    reviewed: false,
    ...(workspaceLabel === undefined ? {} : { workspaceLabel }),
    ...(tabLabel === undefined ? {} : { tabLabel }),
    ...(paneLabel === undefined ? {} : { paneLabel }),
    ...(effectiveCwd === undefined ? {} : { effectiveCwd }),
    git: parseGit(value.git),
    activity: signal === undefined ? { candidates: [] } : { currentSignal: signal, candidates: [] },
    connection: 'stale',
  };
}

function serializeGit(git: GitContext): Readonly<Record<string, unknown>> {
  return {
    status: git.status,
    repoName: optionalBoundedString(git.repoName),
    branch: optionalBoundedString(git.branch),
    clean: git.clean,
    changedFiles: git.changedFiles,
  };
}

function parseGit(value: unknown): GitContext {
  if (!isRecord(value)) return { status: 'stale' };
  const status =
    value.status === 'ready' || value.status === 'not_git' || value.status === 'error'
      ? value.status
      : 'stale';
  const repoName = requiredString(value.repoName);
  const branch = requiredString(value.branch);
  const changedFiles = finiteNumber(value.changedFiles);
  return {
    status,
    ...(repoName === undefined ? {} : { repoName }),
    ...(branch === undefined ? {} : { branch }),
    ...(typeof value.clean === 'boolean' ? { clean: value.clean } : {}),
    ...(changedFiles === undefined ? {} : { changedFiles }),
  };
}

function serializeSignal(
  signal: ActivitySignal | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (signal === undefined || !isCacheableSource(signal.source)) return undefined;
  if (signal.semantics !== 'current_signal' && signal.semantics !== 'repository_change')
    return undefined;
  return {
    text: boundedString(signal.text),
    source: signal.source,
    semantics: signal.semantics,
    confidence: signal.confidence,
    sourceLabel: boundedString(signal.sourceLabel),
  };
}

function parseSignal(value: unknown): ActivitySignal | undefined {
  if (!isRecord(value)) return undefined;
  const text = requiredString(value.text);
  const sourceLabel = requiredString(value.sourceLabel);
  if (text === undefined || sourceLabel === undefined) return undefined;
  if (
    !isActivitySource(value.source) ||
    !isSemantics(value.semantics) ||
    !isConfidence(value.confidence)
  )
    return undefined;
  return {
    text,
    source: value.source,
    semantics: value.semantics,
    confidence: value.confidence,
    sourceLabel,
    stale: true,
  };
}

function requiredString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH
    ? value
    : undefined;
}

function boundedString(value: string): string {
  return value.slice(0, MAX_TEXT_LENGTH);
}

function optionalBoundedString(value: string | undefined): string | undefined {
  return value === undefined ? undefined : boundedString(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function agentState(value: unknown): AgentState | undefined {
  return value === 'blocked' ||
    value === 'done' ||
    value === 'working' ||
    value === 'idle' ||
    value === 'unknown'
    ? value
    : undefined;
}

function isActivitySource(value: unknown): value is ActivitySignal['source'] {
  return isCacheableSource(value);
}

function isCacheableSource(value: unknown): value is ActivitySignal['source'] {
  return [
    'reported_metadata',
    'reported_state_message',
    'terminal_title',
    'native_session',
    'none',
  ].includes(String(value));
}

function isSemantics(value: unknown): value is ActivitySignal['semantics'] {
  return ['current_signal', 'repository_change'].includes(String(value));
}

function isConfidence(value: unknown): value is ActivitySignal['confidence'] {
  return ['explicit', 'derived', 'unknown'].includes(String(value));
}
