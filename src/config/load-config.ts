import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  validateConfig,
  DEFAULT_CONFIG,
  type BoardConfig,
  type ConfigDiagnostics,
} from '@/config/schema';

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

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
