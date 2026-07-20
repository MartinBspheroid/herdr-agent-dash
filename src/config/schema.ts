import type { BoardSort } from '@/contracts';
import {
  booleanValue,
  boundedNumber,
  enumValue,
  isRecord,
  objectOrDefault,
  stringArray,
} from '@/config/validation';

/** Supported board configuration, with all runtime defaults materialized. */
export interface BoardConfig {
  readonly view: {
    readonly defaultMode: 'popup' | 'tab';
    readonly defaultSort: BoardSort;
    readonly visibleColumns: readonly string[];
    readonly compactPathSegments: number;
    readonly showDetail: boolean;
  };
  readonly git: {
    readonly enabled: boolean;
    readonly watchdogMs: number;
    readonly commandTimeoutMs: number;
    readonly maxConcurrency: number;
    readonly includeUntracked: boolean;
  };
  readonly activity: {
    readonly metadataTokens: readonly string[];
    readonly terminalTitle: boolean;
    readonly terminalPreviewLines: number;
    readonly terminalPreviewMaxBytes: number;
    readonly nativeAdapters: readonly string[];
  };
  readonly privacy: {
    readonly persistTimeline: boolean;
    readonly persistTerminalOutput: boolean;
    readonly networkAccess: boolean;
  };
}

/** Columns supported by the renderer and configuration file. */
export const SUPPORTED_VISIBLE_COLUMNS = [
  'state',
  'agent',
  'location',
  'signal',
  'repository',
  'branch',
  'cwd',
] as const;

/** Diagnostics produced while loading optional configuration. */
export interface ConfigDiagnostics {
  readonly warnings: readonly string[];
  readonly sourcePath?: string;
}

/** Safe P0 configuration defaults. */
export const DEFAULT_CONFIG: BoardConfig = {
  view: {
    defaultMode: 'popup',
    defaultSort: 'attention',
    visibleColumns: ['state', 'agent', 'location', 'signal', 'repository', 'branch'],
    compactPathSegments: 3,
    showDetail: true,
  },
  git: {
    enabled: true,
    watchdogMs: 15_000,
    commandTimeoutMs: 1_500,
    maxConcurrency: 4,
    includeUntracked: true,
  },
  activity: {
    metadataTokens: ['summary', 'task', 'phase', 'custom_status', 'state_message'],
    terminalTitle: true,
    terminalPreviewLines: 30,
    terminalPreviewMaxBytes: 8_192,
    nativeAdapters: [],
  },
  privacy: {
    persistTimeline: false,
    persistTerminalOutput: false,
    networkAccess: false,
  },
};

/** Validate a JSON value and retain safe defaults for invalid fields. */
export function validateConfig(input: unknown): { config: BoardConfig; warnings: string[] } {
  if (!isRecord(input)) {
    return { config: DEFAULT_CONFIG, warnings: ['config: expected a JSON object'] };
  }
  const warnings: string[] = [];
  const view = objectOrDefault(input.view, 'view', warnings);
  const git = objectOrDefault(input.git, 'git', warnings);
  const activity = objectOrDefault(input.activity, 'activity', warnings);
  const privacy = objectOrDefault(input.privacy, 'privacy', warnings);
  if (privacy.networkAccess === true)
    warnings.push('privacy.networkAccess: network access is prohibited in P0');
  if (privacy.persistTimeline === true)
    warnings.push('privacy.persistTimeline: persistence is prohibited in P0');
  if (privacy.persistTerminalOutput === true)
    warnings.push('privacy.persistTerminalOutput: persistence is prohibited in P0');
  return {
    config: {
      view: {
        defaultMode: enumValue(
          view.defaultMode,
          ['popup', 'tab'],
          DEFAULT_CONFIG.view.defaultMode,
          'view.defaultMode',
          warnings,
        ),
        defaultSort: enumValue(
          view.defaultSort,
          ['attention', 'state', 'workspace', 'repository', 'branch', 'agent', 'recent'],
          DEFAULT_CONFIG.view.defaultSort,
          'view.defaultSort',
          warnings,
        ),
        visibleColumns: visibleColumnsValue(view.visibleColumns, warnings),
        compactPathSegments: boundedNumber(
          view.compactPathSegments,
          DEFAULT_CONFIG.view.compactPathSegments,
          1,
          12,
          'view.compactPathSegments',
          warnings,
        ),
        showDetail: booleanValue(
          view.showDetail,
          DEFAULT_CONFIG.view.showDetail,
          'view.showDetail',
          warnings,
        ),
      },
      git: {
        enabled: booleanValue(git.enabled, DEFAULT_CONFIG.git.enabled, 'git.enabled', warnings),
        watchdogMs: boundedNumber(
          git.watchdogMs,
          DEFAULT_CONFIG.git.watchdogMs,
          1_000,
          300_000,
          'git.watchdogMs',
          warnings,
        ),
        commandTimeoutMs: boundedNumber(
          git.commandTimeoutMs,
          DEFAULT_CONFIG.git.commandTimeoutMs,
          100,
          30_000,
          'git.commandTimeoutMs',
          warnings,
        ),
        maxConcurrency: boundedNumber(
          git.maxConcurrency,
          DEFAULT_CONFIG.git.maxConcurrency,
          1,
          16,
          'git.maxConcurrency',
          warnings,
        ),
        includeUntracked: booleanValue(
          git.includeUntracked,
          DEFAULT_CONFIG.git.includeUntracked,
          'git.includeUntracked',
          warnings,
        ),
      },
      activity: {
        metadataTokens: stringArray(
          activity.metadataTokens,
          DEFAULT_CONFIG.activity.metadataTokens,
          'activity.metadataTokens',
          warnings,
        ),
        terminalTitle: booleanValue(
          activity.terminalTitle,
          DEFAULT_CONFIG.activity.terminalTitle,
          'activity.terminalTitle',
          warnings,
        ),
        terminalPreviewLines: boundedNumber(
          activity.terminalPreviewLines,
          DEFAULT_CONFIG.activity.terminalPreviewLines,
          1,
          200,
          'activity.terminalPreviewLines',
          warnings,
        ),
        terminalPreviewMaxBytes: boundedNumber(
          activity.terminalPreviewMaxBytes,
          DEFAULT_CONFIG.activity.terminalPreviewMaxBytes,
          256,
          65_536,
          'activity.terminalPreviewMaxBytes',
          warnings,
        ),
        nativeAdapters: stringArray(
          activity.nativeAdapters,
          DEFAULT_CONFIG.activity.nativeAdapters,
          'activity.nativeAdapters',
          warnings,
        ),
      },
      privacy: {
        persistTimeline: false,
        persistTerminalOutput: false,
        networkAccess: false,
      },
    },
    warnings,
  };
}

function visibleColumnsValue(value: unknown, warnings: string[]): readonly string[] {
  const columns = stringArray(
    value,
    DEFAULT_CONFIG.view.visibleColumns,
    'view.visibleColumns',
    warnings,
  );
  const supported = new Set<string>(SUPPORTED_VISIBLE_COLUMNS);
  const valid = columns.filter((column) => supported.has(column));
  if (valid.length !== columns.length)
    warnings.push('view.visibleColumns: unknown columns were removed');
  return valid.length > 0 ? valid : DEFAULT_CONFIG.view.visibleColumns;
}
