import type { Clock, ProcessOptions, ProcessResult, ProcessRunner } from '@/contracts';

const DEFAULT_TIMEOUT_MS = 1_500;
const DEFAULT_OUTPUT_BYTES = 64 * 1024;
const HARD_KILL_SIGNAL = 'SIGKILL' as const;
const CLEANUP_GRACE_MS = 100;

/** Returns wall-clock time and is replaceable in tests. */
export class SystemClock implements Clock {
  /** Return the current epoch time in milliseconds. */
  public now(): number {
    return Date.now();
  }
}

/** Executes argv arrays with bounded output and a timeout watchdog. */
export class BunProcessRunner implements ProcessRunner {
  /** Run one child process without invoking a shell. */
  public async run(argv: readonly string[], options: ProcessOptions = {}): Promise<ProcessResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES;
    const spawnOptions: Parameters<typeof Bun.spawn>[1] = {
      stdout: 'pipe',
      stderr: 'pipe',
    };
    if (options.cwd !== undefined) spawnOptions.cwd = options.cwd;
    if (options.env !== undefined) spawnOptions.env = options.env;
    if (options.signal !== undefined) spawnOptions.signal = options.signal;
    spawnOptions.timeout = timeoutMs;
    spawnOptions.killSignal = HARD_KILL_SIGNAL;
    const process = Bun.spawn([...argv], spawnOptions);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        process.kill(HARD_KILL_SIGNAL);
        resolve();
      }, timeoutMs);
    });
    const stdoutPromise = readBounded(process.stdout, maxOutputBytes).then((value) => {
      if (value.truncated && !timedOut) process.kill(HARD_KILL_SIGNAL);
      return value;
    });
    const stderrPromise = readBounded(process.stderr, maxOutputBytes).then((value) => {
      if (value.truncated && !timedOut) process.kill(HARD_KILL_SIGNAL);
      return value;
    });
    await Promise.race([process.exited, timeout]);
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    if (timedOut) {
      await Promise.race([process.exited, wait(CLEANUP_GRACE_MS)]);
    }
    const [stdout, stderr] = timedOut
      ? await Promise.race([
          Promise.all([stdoutPromise, stderrPromise]),
          wait(CLEANUP_GRACE_MS).then(
            () =>
              [
                { text: '', truncated: true },
                { text: '', truncated: true },
              ] as const,
          ),
        ])
      : await Promise.all([stdoutPromise, stderrPromise]);
    return {
      exitCode: process.exitCode,
      stdout: stdout.text,
      stderr: stderr.text,
      timedOut,
      truncated: stdout.truncated || stderr.truncated,
    };
  }
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

interface BoundedText {
  readonly text: string;
  readonly truncated: boolean;
}

async function readBounded(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  maxBytes: number,
): Promise<BoundedText> {
  if (stream === null || stream === undefined || typeof stream === 'number') {
    return { text: '', truncated: false };
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  let truncated = false;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    const remaining = maxBytes - byteCount;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const chunk = result.value;
    const accepted = chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
    chunks.push(accepted);
    byteCount += accepted.byteLength;
    if (accepted.byteLength < chunk.byteLength) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: decoder.decode(bytes), truncated };
}
