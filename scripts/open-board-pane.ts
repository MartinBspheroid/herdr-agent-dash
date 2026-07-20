import { BunProcessRunner } from '@/app/runtime';

const PLUGIN_ID = 'dev.agent-board';
const COMMAND_TIMEOUT_MS = 15_000;
const POPUP_WIDTH = '90%';
const POPUP_HEIGHT = '85%';

type PaneMode = 'popup' | 'tab';

/** Open the requested Agent Board manifest pane through the active Herdr session. */
export async function openBoardPane(mode: PaneMode): Promise<void> {
  const entrypoint = mode === 'popup' ? 'board-popup' : 'board-tab';
  const placement = mode === 'popup' ? 'popup' : 'tab';
  const binaryPath = process.env.HERDR_BIN_PATH ?? 'herdr';
  const runner = new BunProcessRunner();
  const command = [
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
    '--focus',
  ];
  if (mode === 'popup') command.push('--width', POPUP_WIDTH, '--height', POPUP_HEIGHT);
  const result = await runner.run(command, { timeoutMs: COMMAND_TIMEOUT_MS });
  if (result.timedOut || result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Unable to open the ${mode} Agent Board pane`);
  }
}

if (import.meta.main) {
  const mode = process.argv[2] === 'tab' ? 'tab' : 'popup';
  await openBoardPane(mode);
}
