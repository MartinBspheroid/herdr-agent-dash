import { checkHerdrCompatibility } from '@/herdr/compatibility';
import { NdjsonHerdrTransport } from '@/herdr/ndjson-client';
import { BunProcessRunner } from '@/app/runtime';
import type { ProcessResult } from '@/contracts';

const PLUGIN_ID = 'dev.agent-board';
const LINK_TIMEOUT_MS = 120_000;
const COMMAND_TIMEOUT_MS = 15_000;
const ACTION_SUCCEEDED = 'succeeded';
const ACTION_FAILED = 'failed';

/** Options for the supported-host plugin lifecycle smoke test. */
export interface PluginSmokeOptions {
  readonly binaryPath?: string;
  readonly openEntrypoints?: boolean;
  readonly pluginRoot?: string;
}

/** Link, inspect, optionally open, and unlink the plugin on a supported Herdr host. */
export async function runPluginSmoke(options: PluginSmokeOptions = {}): Promise<void> {
  const runner = new BunProcessRunner();
  const binaryPath = options.binaryPath ?? process.env.HERDR_BIN_PATH ?? 'herdr';
  const pluginRoot = options.pluginRoot ?? process.cwd();
  const compatibility = await checkHerdrCompatibility(runner, binaryPath);
  if (compatibility !== undefined) throw new Error(compatibility);

  let linked = false;
  const openedPaneIds: string[] = [];
  let primaryError: unknown;
  const cleanupErrors: string[] = [];
  try {
    await runCommand(runner, [binaryPath, 'plugin', 'link', pluginRoot], LINK_TIMEOUT_MS);
    linked = true;
    const pluginList = await runCommand(runner, [
      binaryPath,
      'plugin',
      'list',
      '--plugin',
      PLUGIN_ID,
      '--json',
    ]);
    if (!containsString(parseJson(pluginList.stdout), PLUGIN_ID))
      throw new Error(`Herdr plugin list did not contain ${PLUGIN_ID}`);
    const actionList = await runCommand(runner, [
      binaryPath,
      'plugin',
      'action',
      'list',
      '--plugin',
      PLUGIN_ID,
    ]);
    for (const actionId of ['open', 'open-tab']) {
      if (!actionList.stdout.includes(actionId))
        throw new Error(`Herdr action list did not contain ${actionId}`);
    }
    if (options.openEntrypoints === true) {
      await invokeAction(runner, binaryPath, 'open');
      await closePopup();
      openedPaneIds.push(await openPane(runner, binaryPath, 'board-tab', 'tab'));
    }
  } catch (error) {
    primaryError = error;
  } finally {
    for (const paneId of openedPaneIds) {
      try {
        await runCommand(runner, [binaryPath, 'plugin', 'pane', 'close', paneId]);
      } catch (error) {
        cleanupErrors.push(errorMessage(error));
      }
    }
    if (options.openEntrypoints === true) {
      try {
        await closePopup();
      } catch (error) {
        cleanupErrors.push(errorMessage(error));
      }
    }
    if (linked) {
      try {
        await runCommand(runner, [binaryPath, 'plugin', 'unlink', PLUGIN_ID]);
      } catch (error) {
        cleanupErrors.push(errorMessage(error));
      }
    }
  }
  if (primaryError !== undefined) throw primaryError;
  if (cleanupErrors.length > 0)
    throw new Error(`Plugin smoke cleanup failed: ${cleanupErrors.join('; ')}`);
}

async function invokeAction(
  runner: BunProcessRunner,
  binaryPath: string,
  actionId: string,
): Promise<void> {
  const result = await runCommand(runner, [
    binaryPath,
    'plugin',
    'action',
    'invoke',
    actionId,
    '--plugin',
    PLUGIN_ID,
  ]);
  const logId = findString(parseJson(result.stdout), 'log_id');
  if (logId === undefined) throw new Error(`Herdr did not return an action log for ${actionId}`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const logs = await runCommand(runner, [
      binaryPath,
      'plugin',
      'log',
      'list',
      '--plugin',
      PLUGIN_ID,
      '--limit',
      '20',
    ]);
    const log = findRecordByLogId(parseJson(logs.stdout), logId);
    const status = typeof log?.status === 'string' ? log.status : undefined;
    if (status === ACTION_SUCCEEDED) return;
    if (status === ACTION_FAILED) {
      const message = typeof log?.stderr === 'string' ? log.stderr.trim() : '';
      throw new Error(message || `Herdr action ${actionId} failed`);
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for Herdr action ${actionId}`);
}

async function openPane(
  runner: BunProcessRunner,
  binaryPath: string,
  entrypoint: string,
  placement: string,
): Promise<string> {
  const result = await runCommand(runner, [
    binaryPath,
    'plugin',
    'pane',
    'open',
    '--plugin',
    PLUGIN_ID,
    '--entrypoint',
    entrypoint,
    '--placement',
    placement,
    '--no-focus',
  ]);
  const value = parseJson(result.stdout);
  const paneId = findString(value, 'pane_id') ?? findString(value, 'id');
  if (paneId === undefined) throw new Error(`Herdr did not return a pane id for ${entrypoint}`);
  return paneId;
}

async function closePopup(): Promise<void> {
  const socketPath = process.env.HERDR_SOCKET_PATH?.trim();
  if (socketPath === undefined || socketPath.length === 0)
    throw new Error('HERDR_SOCKET_PATH is required to close the popup smoke surface');
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const transport = new NdjsonHerdrTransport(socketPath);
    try {
      await transport.request('popup.close');
      return;
    } catch (error) {
      lastError = error;
    } finally {
      await transport.close();
    }
    await wait(100);
  }
  throw new Error(
    `Unable to close popup: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
  );
}

async function runCommand(
  runner: BunProcessRunner,
  argv: readonly string[],
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<ProcessResult> {
  const result = await runner.run(argv, { timeoutMs, maxOutputBytes: 64 * 1024 });
  if (result.timedOut) throw new Error(`Timed out: ${argv.join(' ')}`);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Failed: ${argv.join(' ')}`);
  return result;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `Expected JSON from Herdr: ${error instanceof Error ? error.message : 'invalid JSON'}`,
    );
  }
}

function findString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value[key] === 'string') return value[key];
  for (const nested of Object.values(value)) {
    const found = findString(nested, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function containsString(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsString(item, expected));
  if (!isRecord(value)) return false;
  return Object.values(value).some((item) => containsString(item, expected));
}

function findRecordByLogId(value: unknown, logId: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecordByLogId(item, logId);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (value.log_id === logId) return value;
  for (const nested of Object.values(value)) {
    const found = findRecordByLogId(nested, logId);
    if (found !== undefined) return found;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown cleanup failure';
}

if (import.meta.main) await runPluginSmoke({ openEntrypoints: process.argv.includes('--open') });
