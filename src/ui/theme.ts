import type { AgentState, ConnectionState } from '@/contracts';

/** Shared terminal palette used by the board chrome and data surfaces. */
export const BOARD_COLORS = {
  canvas: '#02090c',
  panel: '#031014',
  panelRaised: '#07181d',
  selected: '#07313a',
  selectedBorder: '#08c7dd',
  border: '#087f91',
  borderMuted: '#15515d',
  cyan: '#12cfe3',
  text: '#d3dbe2',
  textMuted: '#8996a3',
  textDim: '#596773',
  green: '#43d66f',
  amber: '#f5a623',
  red: '#ff6b6b',
} as const;

/** Return the semantic marker color for one Herdr agent state. */
export function stateColor(state: AgentState): string {
  switch (state) {
    case 'blocked':
      return BOARD_COLORS.red;
    case 'done':
      return BOARD_COLORS.green;
    case 'working':
      return BOARD_COLORS.cyan;
    case 'idle':
      return BOARD_COLORS.textMuted;
    case 'unknown':
      return BOARD_COLORS.amber;
  }
}

/** Return the semantic health color for the current Herdr connection state. */
export function connectionColor(connection: ConnectionState): string {
  return connection === 'live'
    ? BOARD_COLORS.green
    : connection === 'failed' || connection === 'incompatible'
      ? BOARD_COLORS.red
      : BOARD_COLORS.amber;
}
