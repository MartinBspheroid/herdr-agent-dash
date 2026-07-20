import type { ActivitySignal } from '@/contracts';
import type { ActivityContext, ActivityProvider } from '@/activity/provider';

/** Reads configured explicit metadata tokens without interpreting terminal text. */
export class MetadataActivityProvider implements ActivityProvider {
  public readonly id = 'reported-metadata';
  public readonly priority = 100;

  /** Create a provider with an ordered list of metadata token names. */
  public constructor(private readonly tokens: readonly string[]) {}

  /** Support only panes that expose at least one configured token. */
  public supports(context: ActivityContext): boolean {
    return (
      context.pane !== undefined &&
      this.tokens.some((token) => context.pane?.metadata[token] !== undefined)
    );
  }

  /** Return each explicit metadata value as a current signal candidate. */
  public async collect(context: ActivityContext): Promise<readonly ActivitySignal[]> {
    if (context.pane === undefined) return [];
    const signals: ActivitySignal[] = [];
    for (const token of this.tokens) {
      const value = context.pane.metadata[token]?.trim();
      if (value === undefined || value.length === 0) continue;
      signals.push({
        text: value,
        source: token === 'state_message' ? 'reported_state_message' : 'reported_metadata',
        semantics: 'current_signal',
        confidence: 'explicit',
        observedAt: context.observedAt,
        sourceLabel:
          token === 'state_message' ? 'Reported state message' : `Reported metadata: ${token}`,
        stale: false,
      });
    }
    return signals;
  }
}
