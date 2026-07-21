import { BoardError } from '@/app/errors';
import { loadConfig } from '@/config/load-config';
import type { ViewPreferences } from '@/config/schema';
import type { HerdrTransport } from '@/contracts';
import { NdjsonHerdrTransport } from '@/herdr/ndjson-client';
import { popupGeometry } from '@/ui/board-actions';

const PLUGIN_ID = 'dev.agent-board';
const POPUP_ENTRYPOINT = 'board-popup';
const OPEN_ATTEMPTS = 8;
const RETRY_DELAY_MS = 25;

/** Close the active popup and reopen the board with its persisted outer dimensions. */
export async function replaceBoardPopup(
  transport: HerdrTransport,
  preferences: ViewPreferences,
  delay: (milliseconds: number) => Promise<void> = wait,
): Promise<void> {
  const geometry = popupGeometry(preferences);
  await transport.request('popup.close', {});
  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
    try {
      await transport.request('plugin.pane.open', {
        plugin_id: PLUGIN_ID,
        entrypoint: POPUP_ENTRYPOINT,
        placement: 'popup',
        width: geometry.width,
        height: geometry.height,
        focus: true,
      });
      return;
    } catch (error) {
      if (!isUiBusy(error) || attempt === OPEN_ATTEMPTS - 1) throw error;
      await delay(RETRY_DELAY_MS);
    }
  }
}

async function run(): Promise<void> {
  const socketPath = process.env.HERDR_SOCKET_PATH?.trim();
  if (socketPath === undefined || socketPath.length === 0) {
    throw new Error('HERDR_SOCKET_PATH is required to replace the popup');
  }
  const { config } = await loadConfig();
  const preferences: ViewPreferences = {
    showUnknown: config.view.showUnknown,
    compactPopup: config.view.compactPopup,
    popupOrientation: config.view.popupOrientation,
  };
  const transport = new NdjsonHerdrTransport(socketPath);
  try {
    await replaceBoardPopup(transport, preferences);
  } finally {
    await transport.close();
  }
}

function isUiBusy(error: unknown): boolean {
  return error instanceof BoardError && error.code === 'ui_busy';
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

if (import.meta.main) await run();
