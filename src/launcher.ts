import type { BoardMode } from '@/ui/App';

/** Launch the requested board entrypoint through the current Bun executable. */
export async function launch(mode: BoardMode): Promise<number> {
  const child = Bun.spawn([process.execPath, 'run', 'src/main.tsx', '--mode', mode], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return await child.exited;
}

if (import.meta.main) {
  const mode: BoardMode = process.argv[2] === 'tab' ? 'tab' : 'popup';
  process.exit(await launch(mode));
}
