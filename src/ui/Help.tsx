import type { ReactNode } from 'react';

import { BOARD_COLORS } from '@/ui/theme';

/** Render keyboard commands and explicit activity semantics. */
export function Help(): ReactNode {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={BOARD_COLORS.border}
      backgroundColor={BOARD_COLORS.panel}
      padding={2}
      flexDirection="column"
      flexGrow={1}
      gap={1}
    >
      <text fg={BOARD_COLORS.cyan}>KEYBOARD HELP</text>
      <text fg={BOARD_COLORS.text}>
        ↑/k ↓/j navigate · Enter focus · / search · f filter · s sort · d details
      </text>
      <text fg={BOARD_COLORS.text}>
        r refresh all · g refresh Git · o load recent output · q close · Esc back
      </text>
      <text fg={BOARD_COLORS.textMuted}>
        Filters cycle through all, blocked, done, working, idle, and unknown.
      </text>
      <text fg={BOARD_COLORS.textMuted}>
        Sort cycles attention, state, workspace, repository, branch, agent, and recent.
      </text>
      <text fg={BOARD_COLORS.textMuted}>
        Current signal is reported metadata or a derived terminal title; stale data is labelled.
      </text>
      <text fg={BOARD_COLORS.textMuted}>Last request is never presented as current progress.</text>
      <text fg={BOARD_COLORS.textMuted}>
        Recent terminal output is raw evidence, bounded, sanitized, and on demand.
      </text>
    </box>
  );
}
