import type { ConnectionState } from '@/contracts';

/** Explain non-live connection state or the absence of active agents. */
export function connectionMessage(
  connection: ConnectionState,
  agentCount: number,
): string | undefined {
  if (connection === 'failed') return 'Unable to connect to Herdr; press r to retry';
  if (connection === 'incompatible')
    return 'This Herdr version is incompatible; update Herdr and retry';
  if (connection === 'connecting') return 'Connecting to Herdr…';
  if (connection === 'stale') return 'Showing stale data; reconnecting to Herdr…';
  return agentCount === 0 ? 'No active Herdr agents detected' : undefined;
}
