import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';

import { createBoardRuntime } from '@/app/bootstrap';
import { App, type BoardMode } from '@/ui/App';

/** Parse the plugin launch mode with popup as the safe default. */
export function parseBoardMode(args: readonly string[]): BoardMode {
  const index = args.indexOf('--mode');
  const mode = index >= 0 ? args[index + 1] : undefined;
  return mode === 'tab' ? 'tab' : 'popup';
}

/** Start the OpenTUI board entrypoint. */
export async function runBoard(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const requestedMode = args.includes('--mode') ? parseBoardMode(args) : undefined;
  const runtime = await createBoardRuntime(requestedMode);
  const renderer = await createCliRenderer({ exitOnCtrlC: true, clearOnShutdown: true });
  createRoot(renderer).render(
    <App
      store={runtime.store}
      commands={runtime.commands}
      mode={runtime.mode}
      config={runtime.config}
      initialNotice={runtime.startupNotice}
    />,
  );
  await runtime.store.start().catch(() => undefined);
}

if (import.meta.main) {
  await runBoard();
}
