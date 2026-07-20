import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Create a unique temporary directory for a Git fixture test. */
export async function createTempDirectory(name: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), `${name}-`));
}

/** Create a file in a fixture directory, including its parent path. */
export async function createFixtureFile(
  directory: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await writeFile(join(directory, relativePath), content, 'utf8');
}

/** Remove only the explicitly-created temporary fixture directory. */
export async function removeTempDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
