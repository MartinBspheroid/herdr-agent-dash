import type { BoardSort, Clock, CommandService, HerdrTransport, SessionStore } from '@/contracts';
import type { GitDiagnostics } from '@/git/git-enricher';
import type { TransportDiagnostics } from '@/contracts';
import { dirname, join } from 'node:path';

import type { BoardConfig, ViewPreferences } from '@/config/schema';
import { configPathFromEnvironment, loadConfig, saveViewPreferences } from '@/config/load-config';
import { JsonStartupCache } from '@/cache/startup-cache';
import { errorMessage } from '@/app/errors';
import { ActivityEngine } from '@/activity/engine';
import { GitActivityProvider } from '@/activity/git-provider';
import { MetadataActivityProvider } from '@/activity/metadata-provider';
import { TerminalTitleActivityProvider } from '@/activity/terminal-title-provider';
import { DefaultCommandService } from '@/app/command-service';
import { BunProcessRunner, SystemClock } from '@/app/runtime';
import { AgentProjector } from '@/domain/agent-projector';
import { DisabledGitEnricher, SafeGitEnricher, type GitEnricher } from '@/git/git-enricher';
import { CliHerdrTransport } from '@/herdr/cli-client';
import { checkHerdrCompatibility } from '@/herdr/compatibility';
import { NdjsonHerdrTransport } from '@/herdr/ndjson-client';
import { LiveSessionStore } from '@/herdr/session-store';
import { DefaultAgentBoardStore } from '@/app/agent-board-store';

/** Runtime object wired from the public package boundaries. */
export interface BoardRuntime {
  readonly store: DefaultAgentBoardStore;
  readonly commands: CommandService;
  readonly session: SessionStore;
  readonly transport: HerdrTransport;
  readonly startupNotice?: string | undefined;
  readonly config: BoardConfig;
  readonly mode: 'popup' | 'tab';
  readonly savePreferences: (preferences: ViewPreferences) => Promise<void>;
  readonly persistStartupCache: () => Promise<void>;
  readonly getDiagnostics: () => RuntimeDiagnostics;
}

/** Aggregated in-memory health data for local troubleshooting and tests. */
export interface RuntimeDiagnostics {
  readonly connection: ReturnType<SessionStore['getSnapshot']>['connection'];
  readonly transport?: TransportDiagnostics | undefined;
  readonly git?: GitDiagnostics | undefined;
  readonly startupCacheError?: string | undefined;
  readonly preferenceWriteError?: string | undefined;
}

const STARTUP_CACHE_MAX_AGE_MS = 5 * 60 * 1_000;
const STARTUP_CACHE_MAX_CARDS = 200;

/** Create a complete board runtime for popup or tab mode. */
export async function createBoardRuntime(
  requestedMode: 'popup' | 'tab' | undefined,
  clock: Clock = new SystemClock(),
): Promise<BoardRuntime> {
  const runner = new BunProcessRunner();
  const configPath = configPathFromEnvironment();
  const startupCache = new JsonStartupCache(join(dirname(configPath), 'startup-cache.json'), {
    maxAgeMs: STARTUP_CACHE_MAX_AGE_MS,
    maxCards: STARTUP_CACHE_MAX_CARDS,
  });
  const [{ config, diagnostics }, initialCards, compatibility] = await Promise.all([
    loadConfig(configPath),
    startupCache.load(clock.now()),
    checkHerdrCompatibility(runner),
  ]);
  const mode = requestedMode ?? config.view.defaultMode;
  const socketPath = process.env.HERDR_SOCKET_PATH?.trim();
  const transport: HerdrTransport =
    socketPath === undefined || socketPath.length === 0
      ? new CliHerdrTransport(runner)
      : new NdjsonHerdrTransport(socketPath);
  const session = new LiveSessionStore(transport, clock);
  const git: GitEnricher = config.git.enabled
    ? new SafeGitEnricher(runner, clock, {
        timeoutMs: config.git.commandTimeoutMs,
        maxConcurrency: config.git.maxConcurrency,
        includeUntracked: config.git.includeUntracked,
      })
    : new DisabledGitEnricher();
  const activity = new ActivityEngine([
    new MetadataActivityProvider(config.activity.metadataTokens),
    ...(config.activity.terminalTitle ? [new TerminalTitleActivityProvider()] : []),
    new GitActivityProvider(),
  ]);
  const projector = new AgentProjector(git, activity, clock);
  const defaultSort: BoardSort = config.view.defaultSort;
  const store = new DefaultAgentBoardStore({
    session,
    git,
    projector,
    clock,
    defaultSort,
    watchdogMs: config.git.watchdogMs,
    showUnknown: config.view.showUnknown,
    initialCards,
  });
  const commands = new DefaultCommandService(session, transport, git, {
    previewLines: config.activity.terminalPreviewLines,
    previewMaxBytes: config.activity.terminalPreviewMaxBytes,
    popup: mode === 'popup',
  });
  const startupNotice =
    [compatibility, ...diagnostics.warnings]
      .filter((value): value is string => value !== undefined)
      .join(' · ') || undefined;
  let preferenceWriteError: string | undefined;
  let preferenceWrite = Promise.resolve();
  const savePreferences = async (preferences: ViewPreferences): Promise<void> => {
    const pending = preferenceWrite.then(async () => saveViewPreferences(configPath, preferences));
    preferenceWrite = pending.catch((error: unknown) => {
      preferenceWriteError = errorMessage(error);
    });
    await pending;
    preferenceWriteError = undefined;
  };
  const persistStartupCache = async (): Promise<void> => {
    const snapshot = store.getSnapshot();
    if (snapshot.connection === 'live') await startupCache.save(snapshot.agents, clock.now());
  };
  const getDiagnostics = (): RuntimeDiagnostics => ({
    connection: session.getSnapshot().connection,
    transport: transport.getDiagnostics?.(),
    git: git.getDiagnostics?.(),
    startupCacheError: startupCache.getLastError(),
    preferenceWriteError,
  });
  return {
    store,
    commands,
    session,
    transport,
    startupNotice,
    config,
    mode,
    savePreferences,
    persistStartupCache,
    getDiagnostics,
  };
}
