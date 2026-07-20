import { readFile } from 'node:fs/promises';

import { runPrivacySmoke } from '@scripts/privacy-smoke';

const requiredFiles = [
  'herdr-plugin.toml',
  'package.json',
  'src/main.tsx',
  'src/launcher.ts',
  'scripts/open-board-pane.ts',
  'src/herdr/session-store.ts',
  'src/git/git-enricher.ts',
  'src/ui/App.tsx',
];

/** Verify that a clean checkout contains both launch surfaces and safe runtime boundaries. */
export async function runSmoke(): Promise<void> {
  await runPrivacySmoke();
  for (const path of requiredFiles) await readFile(path, 'utf8');
  const manifest = await readFile('herdr-plugin.toml', 'utf8');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as Record<string, unknown>;
  const scripts = packageJson.scripts as Record<string, unknown>;
  const requiredManifestFields = [
    'id = "dev.agent-board"',
    'placement = "overlay"',
    'placement = "tab"',
  ];
  for (const field of requiredManifestFields) {
    if (!manifest.includes(field)) throw new Error(`manifest missing ${field}`);
  }
  for (const script of ['start:popup', 'start:tab', 'smoke', 'privacy:smoke', 'plugin:smoke']) {
    if (typeof scripts[script] !== 'string') throw new Error(`package script missing ${script}`);
  }
}

if (import.meta.main) await runSmoke();
