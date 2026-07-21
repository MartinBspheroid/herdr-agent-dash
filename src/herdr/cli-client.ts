import { BoardError } from '@/app/errors';
import type {
  EventSubscription,
  HerdrEventStream,
  HerdrTransport,
  ProcessRunner,
} from '@/contracts';
import { errorMessage } from '@/app/errors';

const DEFAULT_PREVIEW_LINES = 30;

/** One-shot CLI fallback for hosts where a socket cannot be opened. */
export class CliHerdrTransport implements HerdrTransport {
  /** Create a CLI adapter using HERDR_BIN_PATH or the `herdr` executable. */
  public constructor(
    private readonly runner: ProcessRunner,
    private readonly binaryPath = process.env.HERDR_BIN_PATH ?? 'herdr',
  ) {}

  /** Execute the documented JSON API fallback command. */
  public async request<T>(method: string, params?: unknown): Promise<T> {
    const result = await this.runner.run(cliArguments(this.binaryPath, method, params));
    if (result.timedOut)
      throw new BoardError('herdr_cli_timeout', `Herdr CLI timed out while calling ${method}`);
    if (result.exitCode !== 0)
      throw new BoardError(
        'herdr_cli_failed',
        result.stderr || `Herdr CLI failed while calling ${method}`,
      );
    if (method === 'agent.read' || method === 'pane.read') return result.stdout as T;
    try {
      return JSON.parse(result.stdout) as T;
    } catch (error) {
      throw new BoardError(
        'herdr_cli_invalid_json',
        `Herdr CLI returned invalid JSON: ${errorMessage(error)}`,
        error,
      );
    }
  }

  /** CLI fallback cannot provide an event stream, so fail with an actionable message. */
  public async subscribe(_subscriptions: readonly EventSubscription[]): Promise<HerdrEventStream> {
    throw new BoardError(
      'events_unavailable',
      'Herdr CLI fallback does not support live event subscriptions',
    );
  }

  /** There is no persistent CLI resource to close. */
  public async close(): Promise<void> {}
}

function cliArguments(binaryPath: string, method: string, params: unknown): readonly string[] {
  const target = targetFrom(params);
  if (method === 'session.snapshot') return [binaryPath, 'api', 'snapshot'];
  if (method === 'agent.focus' && target !== undefined)
    return [binaryPath, 'agent', 'focus', target];
  if (method === 'agent.read' && target !== undefined)
    return [
      binaryPath,
      'agent',
      'read',
      target,
      '--source',
      'recent-unwrapped',
      '--lines',
      String(linesFrom(params)),
    ];
  if (method === 'pane.read' && target !== undefined)
    return [
      binaryPath,
      'pane',
      'read',
      target,
      '--source',
      'recent-unwrapped',
      '--lines',
      String(linesFrom(params)),
    ];
  return [
    binaryPath,
    'api',
    method,
    '--json',
    ...(params === undefined ? [] : [JSON.stringify(params)]),
  ];
}

function targetFrom(params: unknown): string | undefined {
  if (!isRecord(params)) return undefined;
  return (
    stringValue(params.target) ?? stringValue(params.terminal_id) ?? stringValue(params.pane_id)
  );
}

function linesFrom(params: unknown): number {
  if (!isRecord(params) || typeof params.lines !== 'number' || !Number.isFinite(params.lines))
    return DEFAULT_PREVIEW_LINES;
  return Math.max(1, Math.min(200, Math.trunc(params.lines)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
