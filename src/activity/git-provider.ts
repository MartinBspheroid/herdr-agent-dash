import type { ActivitySignal } from '@/contracts';
import type { ActivityContext, ActivityProvider } from '@/activity/provider';

/** Converts deterministic Git changes into a separate repository-change signal. */
export class GitActivityProvider implements ActivityProvider {
  public readonly id = 'repository-changes';
  public readonly priority = 10;

  /** Support ready Git contexts with a changed-file count. */
  public supports(context: ActivityContext): boolean {
    return context.git.status === 'ready' && context.git.changedFiles !== undefined;
  }

  /** Return a repository-change signal that cannot masquerade as narrative progress. */
  public async collect(context: ActivityContext): Promise<readonly ActivitySignal[]> {
    const changedFiles = context.git.changedFiles ?? 0;
    const text =
      changedFiles === 0
        ? 'Clean working tree'
        : `${changedFiles} changed file${changedFiles === 1 ? '' : 's'}`;
    return [
      {
        text,
        source: 'none',
        semantics: 'repository_change',
        confidence: 'explicit',
        observedAt: context.git.refreshedAt,
        sourceLabel: 'Repository changes',
        stale: false,
      },
    ];
  }
}
