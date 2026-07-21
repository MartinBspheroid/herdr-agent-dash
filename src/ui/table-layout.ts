import type { BoardLayout } from '@/ui/layout';

/** One explicit table column shared by the header and every data row. */
export interface TableColumnSpec {
  readonly key: string;
  readonly label: string;
  readonly width: number;
  readonly flexible: boolean;
}

const LABELS: Readonly<Record<string, string>> = {
  state: 'STATE',
  agent: 'AGENT',
  location: 'LOCATION',
  signal: 'CURRENT SIGNAL',
  repository: 'REPOSITORY',
  branch: 'BRANCH',
  cwd: 'CWD',
};

const WIDTHS: Readonly<Record<BoardLayout, Readonly<Record<string, number>>>> = {
  compact: {
    state: 12,
    agent: 12,
    location: 16,
    signal: 14,
    repository: 13,
    branch: 14,
    cwd: 18,
  },
  standard: {
    state: 13,
    agent: 15,
    location: 20,
    signal: 18,
    repository: 16,
    branch: 19,
    cwd: 22,
  },
  wide: {
    state: 15,
    agent: 20,
    location: 24,
    signal: 22,
    repository: 20,
    branch: 26,
    cwd: 28,
  },
};

const COMPACT_COLUMNS = ['state', 'agent', 'location', 'signal'] as const;

/** Restrict small mode to the four columns that remain actionable at narrow widths. */
export function visibleColumnsForLayout(
  visibleColumns: readonly string[],
  layout: BoardLayout,
): readonly string[] {
  if (layout !== 'compact') return visibleColumns;
  const configured = new Set(visibleColumns);
  return COMPACT_COLUMNS.filter((column) => configured.has(column));
}

/** Materialize stable column widths for a responsive board layout. */
export function tableColumns(
  visibleColumns: readonly string[],
  layout: BoardLayout,
): readonly TableColumnSpec[] {
  const widths = WIDTHS[layout];
  return visibleColumns.map((key) => ({
    key,
    label: LABELS[key] ?? key.toUpperCase(),
    width: widths[key] ?? 14,
    flexible: key === 'signal',
  }));
}
