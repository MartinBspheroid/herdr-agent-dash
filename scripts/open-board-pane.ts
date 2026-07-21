import { BunProcessRunner } from '@/app/runtime';
import { loadConfig } from '@/config/load-config';
import type { ViewPreferences } from '@/config/schema';
import { popupGeometry } from '@/ui/board-actions';

const PLUGIN_ID = 'dev.agent-board';
const COMMAND_TIMEOUT_MS = 15_000;
type PaneMode = 'popup' | 'tab';

/** Open the requested Agent Board manifest pane through the active Herdr session. */
export async function openBoardPane(mode: PaneMode): Promise<void> {
  const { config } = await loadConfig();
  const preferences: ViewPreferences = {
    showUnknown: config.view.showUnknown,
    compactPopup: config.view.compactPopup,
    popupOrientation: config.view.popupOrientation,
  };
  const binaryPath = process.env.HERDR_BIN_PATH ?? 'herdr';
  const runner = new BunProcessRunner();
  const command = boardPaneCommand(mode, preferences, binaryPath);
  const result = await runner.run(command, { timeoutMs: COMMAND_TIMEOUT_MS });
  if (result.timedOut || result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Unable to open the ${mode} Agent Board pane`);
  }
}

/** Build the exact Herdr CLI request used to open a popup or tab board. */
export function boardPaneCommand(
  mode: PaneMode,
  preferences: ViewPreferences,
  binaryPath: string,
): string[] {
  const entrypoint = mode === 'popup' ? 'board-popup' : 'board-tab';
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
    mode === 'popup' ? 'popup' : 'tab',
    '--focus',
  ];
  if (mode === 'popup') {
    const geometry = popupGeometry(preferences);
    command.push('--width', String(geometry.width), '--height', String(geometry.height));
  }
  return command;
}

if (import.meta.main) {
  const mode = process.argv[2] === 'tab' ? 'tab' : 'popup';
  await openBoardPane(mode);
}
