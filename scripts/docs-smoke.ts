import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'README.md',
  'docs/architecture.md',
  'docs/configuration.md',
  'docs/troubleshooting.md',
  'docs/release-checklist.md',
  'docs/release-report.md',
  'docs/adversarial-review-todo.md',
] as const;

/** Verify that operational documentation names current commands and files. */
export async function runDocsSmoke(): Promise<void> {
  for (const file of requiredFiles) await access(file);
  const readme = await readFile('README.md', 'utf8');
  for (const command of ['bun run check', 'bun run build', 'bun run docs:smoke']) {
    if (!readme.includes(command)) throw new Error(`README is missing ${command}`);
  }
  const configuration = await readFile('docs/configuration.md', 'utf8');
  for (const field of ['defaultMode', 'visibleColumns', 'includeUntracked']) {
    if (!configuration.includes(field)) throw new Error(`configuration docs are missing ${field}`);
  }
}

if (import.meta.main) await runDocsSmoke();
