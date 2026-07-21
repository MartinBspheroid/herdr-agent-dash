import { createConnection, type Socket } from 'node:net';

import { BoardError, errorMessage } from '@/app/errors';
import type { EventSubscription, HerdrEvent } from '@/contracts';
import { AsyncQueue } from '@/herdr/async-queue';
import { parseProtocolLine } from '@/herdr/protocol';

/** Diagnostics emitted by a dedicated event-stream socket. */
export type EventStreamDiagnostic =
  'connected' | 'disconnected' | 'malformed' | 'overflow' | 'frame_limit';

/** Options shared with the request transport without coupling their sockets. */
export interface NdjsonEventStreamOptions {
  readonly requestTimeoutMs: number;
  readonly maxFrameBytes: number;
  readonly maxEventQueue: number;
  readonly onDiagnostic: (kind: EventStreamDiagnostic, message?: string) => void;
  readonly onClose: () => void;
}

/** One acknowledged Herdr subscription backed by its own long-lived socket. */
export class NdjsonEventStream implements AsyncIterable<HerdrEvent> {
  private readonly events: AsyncQueue<HerdrEvent>;
  private socket: Socket | undefined;
  private buffer = '';
  private closed = false;
  private finished = false;

  /** Create an event stream that never shares its socket with ordinary requests. */
  public constructor(
    private readonly socketPath: string,
    private readonly subscriptions: readonly EventSubscription[],
    private readonly options: NdjsonEventStreamOptions,
  ) {
    this.events = new AsyncQueue(options.maxEventQueue);
  }

  /** Connect and wait for Herdr's subscription acknowledgement. */
  public async start(): Promise<void> {
    const socket = createConnection({ path: this.socketPath });
    this.socket = socket;
    socket.setEncoding('utf8');
    const id = `subscription-${Date.now().toString(36)}`;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new BoardError('transport_timeout', 'Herdr request timed out: events.subscribe'));
          socket.destroy();
        }, this.options.requestTimeoutMs);
        const rejectStart = (error: unknown): void => {
          clearTimeout(timer);
          reject(
            new BoardError(
              'transport_disconnected',
              `Herdr event socket disconnected: ${errorMessage(error)}`,
              error,
            ),
          );
        };
        socket.once('error', rejectStart);
        socket.once('close', () => rejectStart(new Error('socket closed before acknowledgement')));
        socket.on('data', (data: string) => {
          this.handleData(
            data,
            id,
            () => {
              clearTimeout(timer);
              socket.off('error', rejectStart);
              resolve();
            },
            reject,
          );
        });
        socket.once('connect', () => {
          const request = JSON.stringify({
            id,
            method: 'events.subscribe',
            params: { subscriptions: this.subscriptions },
          });
          socket.write(`${request}\n`);
        });
      });
    } catch (error) {
      this.close();
      throw error;
    }
    this.options.onDiagnostic('connected');
    socket.on('error', (error) => this.options.onDiagnostic('disconnected', errorMessage(error)));
    socket.on('close', () => {
      if (!this.closed)
        this.options.onDiagnostic('disconnected', 'Herdr event socket disconnected');
      this.finish();
    });
  }

  /** Close this event stream without affecting the request socket. */
  public close(): void {
    this.closed = true;
    this.finish();
    this.socket?.destroy();
  }

  /** Iterate normalized events until the socket closes. */
  public [Symbol.asyncIterator](): AsyncIterator<HerdrEvent> {
    return this.events[Symbol.asyncIterator]();
  }

  /** Return the current bounded event backlog size. */
  public get queuedEvents(): number {
    return this.events.size;
  }

  /** Return whether this stream still owns an open event socket. */
  public get connected(): boolean {
    return !this.finished && this.socket !== undefined && !this.socket.destroyed;
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.events.close();
    this.options.onClose();
  }

  private handleData(
    data: string,
    acknowledgementId: string,
    acknowledge: () => void,
    reject: (error: unknown) => void,
  ): void {
    this.buffer += data;
    if (
      Buffer.byteLength(this.buffer, 'utf8') > this.options.maxFrameBytes &&
      !this.buffer.includes('\n')
    ) {
      this.options.onDiagnostic('frame_limit', 'Herdr event frame exceeded the size limit');
      this.socket?.destroy();
      return;
    }
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      if (Buffer.byteLength(line, 'utf8') > this.options.maxFrameBytes) {
        this.options.onDiagnostic('frame_limit', 'Herdr event frame exceeded the size limit');
        this.socket?.destroy();
        return;
      }
      const parsed = parseProtocolLine(line);
      if (parsed === undefined) continue;
      if ('id' in parsed) {
        if (parsed.id !== acknowledgementId) continue;
        if ('malformed' in parsed) {
          this.options.onDiagnostic('malformed', parsed.reason);
          reject(new BoardError('protocol_malformed', parsed.reason));
        } else if (parsed.error !== undefined) {
          reject(new BoardError(parsed.error.code, parsed.error.message, parsed.error.details));
        } else {
          acknowledge();
        }
        continue;
      }
      if (!this.events.push(parsed)) {
        this.options.onDiagnostic('overflow', 'Herdr event queue is full');
        this.socket?.destroy();
      }
    }
  }
}
