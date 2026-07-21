import type {
  AgentBoardStore,
  AgentCard,
  BoardFilter,
  BoardSort,
  CommandService,
  OutputPreview,
} from '@/contracts';
import type { ViewPreferences } from '@/config/schema';

/** A terminal preview associated with the agent that produced it. */
export interface OwnedPreview {
  readonly agentId: string;
  readonly preview: OutputPreview;
}

/** Apply one persistent display shortcut, leaving unrelated keys to the caller. */
export function preferenceForKey(
  preferences: ViewPreferences,
  key: string,
): ViewPreferences | undefined {
  if (key === 'u') return { ...preferences, showUnknown: !preferences.showUnknown };
  if (key === 's') return { ...preferences, compact: !preferences.compact };
  if (key === 'p')
    return {
      ...preferences,
      detailPosition: preferences.detailPosition === 'horizontal' ? 'vertical' : 'horizontal',
    };
  return undefined;
}

/** Cycle to the next state filter in attention-first order. */
export function nextFilter(filter: BoardFilter): BoardFilter {
  const values: readonly BoardFilter[] = ['all', 'blocked', 'done', 'working', 'idle', 'unknown'];
  return values[(values.indexOf(filter) + 1) % values.length] ?? 'all';
}

/** Cycle to the next supported board sort. */
export function nextSort(sort: BoardSort): BoardSort {
  const values: readonly BoardSort[] = [
    'attention',
    'state',
    'workspace',
    'repository',
    'branch',
    'agent',
    'recent',
  ];
  return values[(values.indexOf(sort) + 1) % values.length] ?? 'attention';
}

/** Focus the selected agent and mark it reviewed when Herdr accepts the action. */
export async function runFocus(
  card: AgentCard | undefined,
  store: AgentBoardStore,
  commands: CommandService,
  setNotice: (value: string) => void,
): Promise<void> {
  if (card === undefined) {
    setNotice('No agent selected');
    return;
  }
  const result = await commands.focusAgent(card.id);
  setNotice(result.message);
  if (result.ok) store.markReviewed(card.id);
}

/** Run a board command and display its result without changing layout geometry. */
export async function runCommand(
  command: () => Promise<{ readonly ok: boolean; readonly message: string }>,
  setNotice: (value: string) => void,
): Promise<void> {
  const result = await command();
  setNotice(result.message);
}

/** Load bounded terminal output for the selected agent on explicit request. */
export async function runOutput(
  card: AgentCard | undefined,
  commands: CommandService,
  setNotice: (value: string) => void,
  setPreview: (value: OwnedPreview | undefined) => void,
): Promise<void> {
  if (card === undefined) {
    setNotice('No agent selected');
    return;
  }
  const result = await commands.loadRecentOutput(card.id);
  setNotice(result.message);
  if (result.ok && result.value !== undefined)
    setPreview({ agentId: card.id, preview: result.value });
}

/** Ask Herdr to close the board and report a recoverable failure in place. */
export async function closeBoard(
  commands: CommandService,
  setNotice: (value: string) => void,
): Promise<void> {
  try {
    await commands.close();
    process.exit(0);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : 'Unable to close the board');
  }
}
