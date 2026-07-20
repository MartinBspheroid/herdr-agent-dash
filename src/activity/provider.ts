import type { ActivitySignal, AgentRecord, GitContext, PaneRecord } from '@/contracts';

/** Provider input containing only normalized, local evidence. */
export interface ActivityContext {
  readonly agent: AgentRecord;
  readonly pane?: PaneRecord | undefined;
  readonly git: GitContext;
  readonly observedAt: number;
}

/** Provider-neutral activity collector contract. */
export interface ActivityProvider {
  readonly id: string;
  readonly priority: number;
  supports(context: ActivityContext): boolean | Promise<boolean>;
  collect(context: ActivityContext): Promise<readonly ActivitySignal[]>;
}
