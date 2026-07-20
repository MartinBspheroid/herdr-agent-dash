import type { BoardSort, Clock, CommandService, HerdrTransport, SessionStore } from '@/contracts';
import type { GitDiagnostics } from '@/git/git-enricher';
import type { TransportDiagnostics } from '@/contracts';
import type { BoardConfig } from '@/config/schema';
import { loadConfig } from '@/config/load-config';
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
  readonly getDiagnostics: () => RuntimeDiagnostics;
}

/** Aggregated in-memory health data for local troubleshooting and tests. */
export interface RuntimeDiagnostics {
  readonly connection: ReturnType<SessionStore['getSnapshot']>['connection'];
  readonly transport?: TransportDiagnostics | undefined;
  readonly git?: GitDiagnostics | undefined;
}

/** Create a complete board runtime for popup or tab mode. */
export async function createBoardRuntime(
  requestedMode: 'popup' | 'tab' | undefined,
  clock: Clock = new SystemClock(),
): Promise<BoardRuntime> {
  const { config, diagnostics } = await loadConfig();
  const mode = requestedMode ?? config.view.defaultMode;
  const runner = new BunProcessRunner();
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
  });
  const commands = new DefaultCommandService(session, transport, git, {
    previewLines: config.activity.terminalPreviewLines,
    previewMaxBytes: config.activity.terminalPreviewMaxBytes,
    popup: mode === 'popup',
  });
  const compatibility = await checkHerdrCompatibility(runner);
  const startupNotice =
    [compatibility, ...diagnostics.warnings]
      .filter((value): value is string => value !== undefined)
      .join(' · ') || undefined;
  const getDiagnostics = (): RuntimeDiagnostics => ({
    connection: session.getSnapshot().connection,
    transport: transport.getDiagnostics?.(),
    git: git.getDiagnostics?.(),
  });
  return { store, commands, session, transport, startupNotice, config, mode, getDiagnostics };
}
