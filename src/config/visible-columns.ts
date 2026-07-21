import { stringArray } from '@/config/validation';

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

/** Default columns used when configuration is absent or invalid. */
export const DEFAULT_VISIBLE_COLUMNS = [
  'state',
  'agent',
  'location',
  'signal',
  'repository',
  'branch',
] as const;

/** Validate configured columns while preserving at least one useful column. */
export function visibleColumnsValue(value: unknown, warnings: string[]): readonly string[] {
  const columns = stringArray(value, DEFAULT_VISIBLE_COLUMNS, 'view.visibleColumns', warnings);
  const supported = new Set<string>(SUPPORTED_VISIBLE_COLUMNS);
  const valid = columns.filter((column) => supported.has(column));
  if (valid.length !== columns.length)
    warnings.push('view.visibleColumns: unknown columns were removed');
  return valid.length > 0 ? valid : DEFAULT_VISIBLE_COLUMNS;
}
