import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE_ROOT = 'src';
const NETWORK_PATTERNS = [
  /\bfetch\s*\(/u,
  /\bWebSocket\b/u,
  /\bBun\.connect\b/u,
  /\bhttps?:\/\//u,
] as const;
const PERSISTENCE_PATTERNS = [
  /\bwriteFile(?:Sync)?\b/u,
  /\bappendFile(?:Sync)?\b/u,
  /\bcreateWriteStream\b/u,
] as const;
const PERSISTENCE_ALLOWLIST = new Set(['src/cache/startup-cache.ts', 'src/config/load-config.ts']);

/** Verify that production source remains local-only and does not persist raw content. */
export async function runPrivacySmoke(): Promise<void> {
  const files = await sourceFiles(SOURCE_ROOT);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assertAbsent(file, source, NETWORK_PATTERNS, 'network access');
    if (!PERSISTENCE_ALLOWLIST.has(file))
      assertAbsent(file, source, PERSISTENCE_PATTERNS, 'raw-content persistence');
  }
  const schema = await readFile(join(SOURCE_ROOT, 'config/schema.ts'), 'utf8');
  for (const setting of [
    'networkAccess: false',
    'persistTimeline: false',
    'persistTerminalOutput: false',
  ]) {
    if (!schema.includes(setting)) throw new Error(`Privacy default missing: ${setting}`);
  }
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) files.push(path);
  }
  return files;
}

function assertAbsent(
  file: string,
  source: string,
  patterns: readonly RegExp[],
  category: string,
): void {
  for (const pattern of patterns) {
    if (pattern.test(source)) throw new Error(`${category} pattern ${pattern} found in ${file}`);
  }
}

if (import.meta.main) await runPrivacySmoke();
