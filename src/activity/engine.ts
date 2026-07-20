import type { ActivityBundle, ActivitySignal } from '@/contracts';
import type { ActivityContext, ActivityProvider } from '@/activity/provider';

/** Provider-priority activity engine that preserves provenance for every candidate. */
export class ActivityEngine {
  private readonly providers: readonly ActivityProvider[];

  /** Sort providers once so explicit evidence always outranks derived evidence. */
  public constructor(providers: readonly ActivityProvider[]) {
    this.providers = providers.toSorted((left, right) => right.priority - left.priority);
  }

  /** Collect all supported evidence and select a current signal without inference. */
  public async collect(context: ActivityContext): Promise<ActivityBundle> {
    const candidates: ActivitySignal[] = [];
    for (const provider of this.providers) {
      if (!(await provider.supports(context))) continue;
      candidates.push(...(await provider.collect(context)));
    }
    const currentSignal = candidates.find((signal) => signal.semantics === 'current_signal');
    const lastRequest = candidates.find((signal) => signal.semantics === 'last_request');
    const recentOutput = candidates.find((signal) => signal.semantics === 'raw_output');
    const repositoryChange = candidates.find((signal) => signal.semantics === 'repository_change');
    return { currentSignal, lastRequest, recentOutput, repositoryChange, candidates };
  }
}
