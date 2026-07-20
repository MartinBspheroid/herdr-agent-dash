import type { AgentCard } from '@/contracts';

/** Return cards whose searchable identity, location, Git, or activity matches a query. */
export function matchesSearch(card: AgentCard, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const haystack = tokenize(
    [
      card.id,
      card.agent,
      card.displayName,
      card.provider,
      card.workspaceLabel,
      card.tabLabel,
      card.paneLabel,
      card.cwd,
      card.effectiveCwd,
      card.git.repoRoot,
      card.git.repoName,
      card.git.branch,
      card.activity.currentSignal?.text,
      card.activity.lastRequest?.text,
      card.activity.recentOutput?.text,
      card.activity.repositoryChange?.text,
    ]
      .filter((value): value is string => value !== undefined)
      .join(' '),
  );
  return tokens.every((token) => haystack.some((item) => item.includes(token)));
}

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter((item) => item.length > 0);
}
