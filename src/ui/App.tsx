import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';

import type { AgentBoardSnapshot, AgentBoardStore, CommandService } from '@/contracts';
import { errorMessage } from '@/app/errors';
import type { BoardConfig, ViewPreferences } from '@/config/schema';
import { AgentTable } from '@/ui/AgentTable';
import {
  closeBoard,
  nextFilter,
  nextSort,
  preferenceForKey,
  runCommand,
  runFocus,
  runOutput,
  type OwnedPreview,
} from '@/ui/board-actions';
import { DetailPanel } from '@/ui/DetailPanel';
import { Help } from '@/ui/Help';
import { layoutForWidth } from '@/ui/layout';
import { BoardFooter, BoardToolbar, StatusBar } from '@/ui/StatusBar';
import { BOARD_COLORS } from '@/ui/theme';

/** Board mode controls popup close behavior while keeping the view shared. */
export type BoardMode = 'popup' | 'tab';

const DETAIL_PANEL_WIDTH = 56;

/** Render the fixed-geometry, keyboard-first board against store and command interfaces. */
export function App({
  store,
  commands,
  mode,
  config,
  initialNotice,
  savePreferences,
}: {
  readonly store: AgentBoardStore;
  readonly commands: CommandService;
  readonly mode: BoardMode;
  readonly config: BoardConfig;
  readonly initialNotice?: string | undefined;
  readonly savePreferences: (preferences: ViewPreferences) => Promise<void>;
}): ReactNode {
  const [snapshot, setSnapshot] = useState<AgentBoardSnapshot>(() => store.getSnapshot());
  const [showHelp, setShowHelp] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(initialNotice);
  const [preview, setPreview] = useState<OwnedPreview | undefined>();
  const initialPreferences: ViewPreferences = {
    showUnknown: config.view.showUnknown,
    compactPopup: config.view.compactPopup,
    popupOrientation: config.view.popupOrientation,
  };
  const preferencesRef = useRef(initialPreferences);
  const { width } = useTerminalDimensions();
  const layout = layoutForWidth(width);
  const wide = layout === 'wide';
  const [showDetail, setShowDetail] = useState(config.view.showDetail && layout !== 'compact');
  const selected = useMemo(
    () => snapshot.agents.find((card) => card.id === snapshot.selectedAgentId),
    [snapshot],
  );

  useEffect(() => store.subscribe(() => setSnapshot(store.getSnapshot())), [store]);
  useEffect(() => setPreview(undefined), [snapshot.selectedAgentId]);

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
    else if (key.name === 't') store.setSort(nextSort(snapshot.sort));
    else if (key.name === 'u') {
      const next = preferenceForKey(preferencesRef.current, key.name);
      if (next !== undefined) {
        preferencesRef.current = next;
        if (next.showUnknown !== snapshot.showUnknown) store.setShowUnknown(next.showUnknown);
        void savePreferences(next).catch((error: unknown) =>
          setNotice(`Unable to save display preferences: ${errorMessage(error)}`),
        );
      }
    } else if (key.name === 's' || key.name === 'p') {
      const next = preferenceForKey(preferencesRef.current, key.name);
      if (next !== undefined) {
        preferencesRef.current = next;
        void saveAndApplyPopupGeometry(next, mode, commands, savePreferences, setNotice);
      }
    } else if (key.name === 'd') setShowDetail((value) => !value);
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
    else if (key.name === '?') setShowHelp(true);
    else if (key.name === 'q') void closeBoard(commands, setNotice);
  });

  const detail = (
    <DetailPanel
      card={selected}
      compact={layout === 'compact'}
      compactPathSegments={config.view.compactPathSegments}
      now={snapshot.generatedAt}
      panelWidth={wide ? DETAIL_PANEL_WIDTH : undefined}
    />
  );

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={BOARD_COLORS.border}
      backgroundColor={BOARD_COLORS.canvas}
      overflow="hidden"
    >
      <StatusBar snapshot={snapshot} />
      <BoardToolbar
        snapshot={snapshot}
        notice={notice}
        searching={searching}
        onSearch={(value) => store.setSearch(value)}
        onSubmit={() => setSearching(false)}
      />
      <box flexGrow={1} minHeight={0} padding={1} overflow="hidden">
        {showHelp ? (
          <Help />
        ) : !wide && showDetail ? (
          detail
        ) : (
          <box
            flexDirection="row"
            flexGrow={1}
            minWidth={0}
            minHeight={0}
            gap={1}
            overflow="hidden"
          >
            <AgentTable
              snapshot={snapshot}
              visibleColumns={config.view.visibleColumns}
              compactPathSegments={config.view.compactPathSegments}
              layout={layout}
            />
            {wide && showDetail ? detail : null}
          </box>
        )}
        <OutputOverlay preview={preview} selectedId={selected?.id} />
      </box>
      <BoardFooter snapshot={snapshot} />
    </box>
  );
}

async function saveAndApplyPopupGeometry(
  preferences: ViewPreferences,
  mode: BoardMode,
  commands: CommandService,
  savePreferences: (preferences: ViewPreferences) => Promise<void>,
  setNotice: (value: string) => void,
): Promise<void> {
  try {
    await savePreferences(preferences);
  } catch (error) {
    setNotice(`Unable to save popup preferences: ${errorMessage(error)}`);
    return;
  }
  if (mode !== 'popup') {
    setNotice('Popup geometry saved; reopen the popup to apply it');
    return;
  }
  const result = await commands.applyPopupGeometry();
  setNotice(result.message);
}

function OutputOverlay({
  preview,
  selectedId,
}: {
  readonly preview: OwnedPreview | undefined;
  readonly selectedId: string | undefined;
}): ReactNode {
  if (preview === undefined || preview.agentId !== selectedId) return null;
  return (
    <box
      position="absolute"
      bottom={1}
      left={1}
      right={1}
      height={7}
      border
      borderStyle="rounded"
      borderColor={BOARD_COLORS.amber}
      backgroundColor={BOARD_COLORS.panelRaised}
      padding={1}
      flexDirection="column"
      overflow="hidden"
    >
      <text fg={BOARD_COLORS.amber} wrapMode="none">
        Recent terminal output · on demand
      </text>
      <text fg={BOARD_COLORS.text} wrapMode="word" truncate>
        {preview.preview.text}
      </text>
    </box>
  );
}
