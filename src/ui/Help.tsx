import type { ReactNode } from 'react';

/** Render keyboard commands and explicit activity semantics. */
export function Help(): ReactNode {
  return (
    <box border borderStyle="double" padding={1} flexDirection="column">
      <text fg="#8be9fd">KEYBOARD HELP</text>
      <text>↑/k ↓/j navigate · Enter focus · / search · f filter · s sort · d details</text>
      <text>r refresh all · g refresh Git · o load recent output · q close · Esc back</text>
      <text>Filters cycle through all, blocked, done, working, idle, and unknown.</text>
      <text>Sort cycles attention, state, workspace, repository, branch, agent, and recent.</text>
      <text>
        Current signal is reported metadata or a derived terminal title; stale data is labelled.
      </text>
      <text>Last request is never presented as current progress.</text>
      <text>Recent terminal output is raw evidence, bounded, sanitized, and on demand.</text>
    </box>
  );
}
