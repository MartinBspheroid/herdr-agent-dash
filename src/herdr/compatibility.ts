import type { ProcessRunner } from '@/contracts';

/** Minimum Herdr version required by the plugin manifest and socket contract. */
export const MINIMUM_HERDR_VERSION = '0.7.4';

/** Check the local Herdr binary without making network requests. */
export async function checkHerdrCompatibility(
  runner: ProcessRunner,
  binaryPath = process.env.HERDR_BIN_PATH ?? 'herdr',
): Promise<string | undefined> {
  let result;
  try {
    result = await runner.run([binaryPath, '--version'], {
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
    });
  } catch {
    return `Unable to verify Herdr ${MINIMUM_HERDR_VERSION}+ compatibility`;
  }
  if (result.timedOut || result.exitCode !== 0)
    return `Unable to verify Herdr ${MINIMUM_HERDR_VERSION}+ compatibility`;
  const version = /\b(\d+\.\d+\.\d+)\b/u.exec(result.stdout)?.[1];
  if (version === undefined)
    return `Herdr version is unavailable; this board requires ${MINIMUM_HERDR_VERSION}+`;
  if (compareVersions(version, MINIMUM_HERDR_VERSION) < 0)
    return `Herdr ${version} is too old; update to ${MINIMUM_HERDR_VERSION}+`;
  return undefined;
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
