import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  validateConfig,
  DEFAULT_CONFIG,
  type BoardConfig,
  type ConfigDiagnostics,
  type ViewPreferences,
} from '@/config/schema';
import { isRecord } from '@/config/validation';

/** Resolve Herdr's plugin configuration directory from environment variables. */
export function configPathFromEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  const directory = env.HERDR_PLUGIN_CONFIG_DIR ?? join(process.cwd(), '.herdr-agent-board');
  return join(directory, 'config.json');
}

/** Load optional configuration without making configuration a startup requirement. */
export async function loadConfig(path = configPathFromEnvironment()): Promise<{
  readonly config: BoardConfig;
  readonly diagnostics: ConfigDiagnostics;
}> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(text);
    const result = validateConfig(parsed);
    return { config: result.config, diagnostics: { warnings: result.warnings, sourcePath: path } };
  } catch (error) {
    if (isMissingFile(error)) {
      return { config: DEFAULT_CONFIG, diagnostics: { warnings: [] } };
    }
    const message = error instanceof Error ? error.message : 'invalid JSON';
    return {
      config: DEFAULT_CONFIG,
      diagnostics: { warnings: [`config: ${message}`], sourcePath: path },
    };
  }
}

/** Atomically merge user view preferences into the optional plugin configuration file. */
export async function saveViewPreferences(
  path: string,
  preferences: ViewPreferences,
): Promise<void> {
  const current = await readConfigObject(path);
  const view = isRecord(current.view) ? current.view : {};
  const next = { ...current, view: { ...view, ...preferences } };
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

async function readConfigObject(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if (isMissingFile(error)) return {};
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
