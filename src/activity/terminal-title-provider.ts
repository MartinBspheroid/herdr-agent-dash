import type { ActivitySignal } from '@/contracts';
import { sanitizeTitle } from '@/safety/sanitize-terminal';
import type { ActivityContext, ActivityProvider } from '@/activity/provider';

/** Uses only Herdr's sanitized terminal title as derived activity evidence. */
export class TerminalTitleActivityProvider implements ActivityProvider {
  public readonly id = 'terminal-title';
  public readonly priority = 50;

  /** Support panes with a non-empty title field. */
  public supports(context: ActivityContext): boolean {
    return (
      context.pane?.terminalTitleStripped !== undefined || context.pane?.terminalTitle !== undefined
    );
  }

  /** Return a safely normalized title labelled as a derived current signal. */
  public async collect(context: ActivityContext): Promise<readonly ActivitySignal[]> {
    const title = sanitizeTitle(
      context.pane?.terminalTitleStripped ?? context.pane?.terminalTitle ?? '',
    );
    if (title.length === 0) return [];
    return [
      {
        text: title,
        source: 'terminal_title',
        semantics: 'current_signal',
        confidence: 'derived',
        observedAt: context.observedAt,
        sourceLabel: 'Terminal title',
        stale: false,
      },
    ];
  }
}
