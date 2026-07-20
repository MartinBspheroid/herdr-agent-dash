import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';

import type {
  AgentBoardSnapshot,
  AgentCard,
  BoardFilter,
  BoardSort,
  CommandService,
  AgentBoardStore,
  OutputPreview,
} from '@/contracts';
import type { BoardConfig } from '@/config/schema';
import { AgentRow } from '@/ui/AgentRow';
import { DetailPanel } from '@/ui/DetailPanel';
import { Help } from '@/ui/Help';
import { StatusBar } from '@/ui/StatusBar';
import { layoutForWidth } from '@/ui/layout';

/** Board mode controls popup close behavior while keeping the view shared. */
export type BoardMode = 'popup' | 'tab';

/** Render the responsive keyboard-first board against store and command interfaces. */
export function App({
  store,
  commands,
  mode,
  config,
  initialNotice,
}: {
  readonly store: AgentBoardStore;
  readonly commands: CommandService;
  readonly mode: BoardMode;
  readonly config: BoardConfig;
  readonly initialNotice?: string | undefined;
}): ReactNode {
  const [snapshot, setSnapshot] = useState<AgentBoardSnapshot>(() => store.getSnapshot());
  const [showHelp, setShowHelp] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(initialNotice);
  const [preview, setPreview] = useState<OwnedPreview | undefined>();
  const { width } = useTerminalDimensions();
  const layout = layoutForWidth(width);
  const compact = layout === 'compact';
  const wide = layout === 'wide';
  const [showDetail, setShowDetail] = useState(config.view.showDetail && !compact);
  const selected = useMemo(
    () => snapshot.agents.find((card) => card.id === snapshot.selectedAgentId),
    [snapshot],
  );

  useEffect(() => store.subscribe(() => setSnapshot(store.getSnapshot())), [store]);
  useEffect(() => setPreview(undefined), [snapshot.selectedAgentId]);

  const table = (
    <box border borderStyle="single" flexDirection="column" flexGrow={1}>
      <text fg="#9aa7b6" wrapMode="none" truncate>
        {formatHeader(config.view.visibleColumns)}
      </text>
      {snapshot.visibleAgents.length === 0 ? (
        <text>{snapshot.message ?? 'No agents match the current filter'}</text>
      ) : (
        snapshot.visibleAgents.map((card) => (
          <AgentRow
            key={card.id}
            card={card}
            selected={card.id === snapshot.selectedAgentId}
            visibleColumns={config.view.visibleColumns}
            compactPathSegments={config.view.compactPathSegments}
          />
        ))
      )}
    </box>
  );
  const detail = (
    <DetailPanel
      card={selected}
      compact={compact}
      compactPathSegments={config.view.compactPathSegments}
      now={snapshot.generatedAt}
    />
  );

  useKeyboard((key) => {
    if (searching) {
      if (key.name === 'escape') setSearching(false);
      return;
    }
    if (showHelp) {
      if (key.name === 'escape' || key.name === '?') setShowHelp(false);
      return;
    }
    if (key.name === 'up' || key.name === 'k') store.moveSelection(-1);
    else if (key.name === 'down' || key.name === 'j') store.moveSelection(1);
    else if (key.name === 'return') void runFocus(selected, store, commands, setNotice);
    else if (key.name === '/') setSearching(true);
    else if (key.name === 'escape') {
      if (snapshot.search.length > 0) store.setSearch('');
      else if (snapshot.filter !== 'all') store.setFilter('all');
      else if (showDetail) setShowDetail(false);
      else if (mode === 'popup') void closeBoard(commands, setNotice);
    } else if (key.name === 'f') store.setFilter(nextFilter(snapshot.filter));
    else if (key.name === 's') store.setSort(nextSort(snapshot.sort));
    else if (key.name === 'd') setShowDetail((value) => !value);
    else if (key.name === 'r') void runCommand(commands.refreshAll, setNotice);
    else if (key.name === 'g')
      void runCommand(
        () =>
          selected === undefined
            ? Promise.resolve({ ok: false, message: 'No agent selected' })
            : commands.refreshGit(selected.id),
        setNotice,
      );
    else if (key.name === 'o') void runOutput(selected, commands, setNotice, setPreview);
    else if (key.name === '?') setShowHelp((value) => !value);
    else if (key.name === 'q') void closeBoard(commands, setNotice);
  });

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1}>
      <StatusBar snapshot={snapshot} notice={notice} />
      {searching ? (
        <input
          placeholder="Search agents, paths, branches, activity…"
          focused
          value={snapshot.search}
          onInput={(value) => store.setSearch(value)}
          onSubmit={() => setSearching(false)}
        />
      ) : null}
      {showHelp ? (
        <Help />
      ) : (
        <>
          {compact && showDetail ? (
            detail
          ) : wide ? (
            <box flexDirection="row" flexGrow={1}>
              {table}
              {showDetail ? detail : null}
            </box>
          ) : (
            <>
              {table}
              {showDetail ? detail : null}
            </>
          )}
          {preview === undefined || preview.agentId !== selected?.id ? null : (
            <box border padding={1} flexDirection="column">
              <text fg="#ffb86c">Recent terminal output · on demand</text>
              <text>{preview.preview.text}</text>
            </box>
          )}
        </>
      )}
    </box>
  );
}

function formatHeader(columns: readonly string[]): string {
  const labels: Readonly<Record<string, string>> = {
    state: 'STATE',
    agent: 'AGENT',
    location: 'LOCATION',
    signal: 'CURRENT SIGNAL',
    repository: 'REPOSITORY',
    branch: 'BRANCH',
    cwd: 'CWD',
  };
  return `   ${columns.map((column) => labels[column] ?? column.toUpperCase()).join('   ')}`;
}

async function runFocus(
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

async function runCommand(
  command: () => Promise<{ readonly ok: boolean; readonly message: string }>,
  setNotice: (value: string) => void,
): Promise<void> {
  const result = await command();
  setNotice(result.message);
}

async function runOutput(
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

async function closeBoard(
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

interface OwnedPreview {
  readonly agentId: string;
  readonly preview: OutputPreview;
}

function nextFilter(filter: BoardFilter): BoardFilter {
  const values: readonly BoardFilter[] = ['all', 'blocked', 'done', 'working', 'idle', 'unknown'];
  return values[(values.indexOf(filter) + 1) % values.length] ?? 'all';
}

function nextSort(sort: BoardSort): BoardSort {
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
