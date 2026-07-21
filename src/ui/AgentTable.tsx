import { useEffect, useRef, type ReactNode } from 'react';
import type { ScrollBoxRenderable } from '@opentui/core';

import type { AgentBoardSnapshot } from '@/contracts';
import { AgentRow, agentRowId } from '@/ui/AgentRow';
import type { BoardLayout } from '@/ui/layout';
import { tableColumns, visibleColumnsForLayout, type TableColumnSpec } from '@/ui/table-layout';
import { BOARD_COLORS } from '@/ui/theme';

/** Render the fixed-header, scrollable agent table and navigation footer. */
export function AgentTable({
  snapshot,
  visibleColumns,
  compactPathSegments,
  layout,
}: {
  readonly snapshot: AgentBoardSnapshot;
  readonly visibleColumns: readonly string[];
  readonly compactPathSegments: number;
  readonly layout: BoardLayout;
}): ReactNode {
  const scrollbox = useRef<ScrollBoxRenderable | null>(null);
  const effectiveColumns = visibleColumnsForLayout(visibleColumns, layout);
  const columns = tableColumns(effectiveColumns, layout);

  useEffect(() => {
    if (snapshot.selectedAgentId !== undefined)
      scrollbox.current?.scrollChildIntoView(agentRowId(snapshot.selectedAgentId));
  }, [snapshot.selectedAgentId]);

  return (
    <box
      border
      borderStyle="rounded"
      borderColor={BOARD_COLORS.border}
      backgroundColor={BOARD_COLORS.panel}
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      minWidth={0}
      overflow="hidden"
    >
      <TableHeader columns={columns} />
      {snapshot.visibleAgents.length === 0 ? (
        <box flexGrow={1} justifyContent="center" alignItems="center" padding={1}>
          <text fg={BOARD_COLORS.textMuted} wrapMode="word">
            {snapshot.message ?? 'No agents match the current filter'}
          </text>
        </box>
      ) : (
        <scrollbox
          ref={scrollbox}
          flexGrow={1}
          width="100%"
          scrollY
          scrollX={false}
          viewportCulling
          contentOptions={{ flexDirection: 'column', width: '100%' }}
          viewportOptions={{ backgroundColor: BOARD_COLORS.panel }}
          verticalScrollbarOptions={{
            showArrows: false,
            trackOptions: {
              backgroundColor: BOARD_COLORS.panel,
              foregroundColor: BOARD_COLORS.border,
            },
          }}
        >
          {snapshot.visibleAgents.map((card) => (
            <AgentRow
              key={card.id}
              card={card}
              selected={card.id === snapshot.selectedAgentId}
              visibleColumns={effectiveColumns}
              compactPathSegments={compactPathSegments}
              layout={layout}
            />
          ))}
        </scrollbox>
      )}
      <TableFooter snapshot={snapshot} />
    </box>
  );
}

function TableHeader({ columns }: { readonly columns: readonly TableColumnSpec[] }): ReactNode {
  return (
    <box
      height={2}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      border={['bottom']}
      borderColor={BOARD_COLORS.borderMuted}
      overflow="hidden"
    >
      {columns.map((column) => {
        const layout = column.flexible
          ? { flexGrow: 1, flexBasis: 0, minWidth: column.width }
          : {
              width: column.width,
              minWidth: column.width,
              maxWidth: column.width,
              flexShrink: 0,
            };
        return (
          <box key={column.key} paddingLeft={1} overflow="hidden" {...layout}>
            <text fg={BOARD_COLORS.cyan} wrapMode="none" truncate>
              {column.key === 'state' ? `▾ ${column.label}` : column.label}
            </text>
          </box>
        );
      })}
    </box>
  );
}

function TableFooter({ snapshot }: { readonly snapshot: AgentBoardSnapshot }): ReactNode {
  const count = snapshot.visibleAgents.length;
  const range = count === 0 ? '0 of 0' : `1–${count} of ${count}`;
  return (
    <box
      height={3}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      border={['top']}
      borderColor={BOARD_COLORS.borderMuted}
      paddingX={1}
    >
      <text fg={BOARD_COLORS.textMuted} wrapMode="none" truncate>
        <span fg={BOARD_COLORS.cyan}>↑/↓</span> navigate <span fg={BOARD_COLORS.cyan}>•</span> Enter
        focus <span fg={BOARD_COLORS.cyan}>•</span> <span fg={BOARD_COLORS.cyan}>t</span> sort{' '}
        <span fg={BOARD_COLORS.cyan}>•</span> <span fg={BOARD_COLORS.cyan}>u</span> unknown{' '}
        <span fg={BOARD_COLORS.cyan}>•</span> <span fg={BOARD_COLORS.cyan}>s</span> small{' '}
        <span fg={BOARD_COLORS.cyan}>•</span> <span fg={BOARD_COLORS.cyan}>p</span> position
      </text>
      <text fg={BOARD_COLORS.textMuted} wrapMode="none">
        {range}
      </text>
    </box>
  );
}
