import { createConnection, type Socket } from 'node:net';

import { BoardError, errorMessage } from '@/app/errors';
import type {
  EventSubscription,
  HerdrEventStream,
  HerdrTransport,
  TransportDiagnostics,
} from '@/contracts';
import { NdjsonEventStream, type EventStreamDiagnostic } from '@/herdr/ndjson-event-stream';
import { parseProtocolLine } from '@/herdr/protocol';

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Runtime limits for the Herdr socket boundary. */
export interface NdjsonTransportOptions {
  readonly requestTimeoutMs?: number;
  readonly maxFrameBytes?: number;
  readonly maxEventQueue?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_FRAME_BYTES = 128 * 1024;
const DEFAULT_MAX_EVENT_QUEUE = 1_024;

/** Unix-socket NDJSON transport with request correlation and event streaming. */
export class NdjsonHerdrTransport implements HerdrTransport {
  private readonly pending = new Map<string, PendingRequest>();
  private socketPromise: Promise<Socket> | undefined;
  private socket: Socket | undefined;
  private sequence = 0;
  private closed = false;
  private buffer = '';
  private requestCount = 0;
  private timeoutCount = 0;
  private malformedCount = 0;
  private frameLimitCount = 0;
  private queueOverflowCount = 0;
  private disconnectCount = 0;
  private lastError: string | undefined;
  private readonly eventStreams = new Set<NdjsonEventStream>();

  /** Create a transport for a Herdr Unix socket with explicit resource limits. */
  public constructor(
    private readonly socketPath: string,
    private readonly options: NdjsonTransportOptions = {},
  ) {}

  /** Send one correlated request and resolve its result payload. */
  public async request<T>(method: string, params?: unknown): Promise<T> {
    const socket = await this.connect();
    if (this.closed) throw new BoardError('transport_closed', 'Herdr transport is closed');
    const id = `${Date.now().toString(36)}-${(this.sequence += 1).toString(36)}`;
    this.requestCount += 1;
    const message = JSON.stringify({ id, method, params: params === undefined ? {} : params });
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BoardError('transport_timeout', `Herdr request timed out: ${method}`));
        this.timeoutCount += 1;
        this.lastError = `request timed out: ${method}`;
      }, this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
    });
    try {
      socket.write(`${message}\n`);
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending !== undefined) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      }
    }
    return (await result) as T;
  }

  /** Subscribe to normalized events after acknowledging the server subscription. */
  public async subscribe(subscriptions: readonly EventSubscription[]): Promise<HerdrEventStream> {
    const stream = new NdjsonEventStream(this.socketPath, subscriptions, {
      requestTimeoutMs: this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      maxFrameBytes: this.options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES,
      maxEventQueue: this.options.maxEventQueue ?? DEFAULT_MAX_EVENT_QUEUE,
      onDiagnostic: (kind, message) => this.recordEventDiagnostic(kind, message),
      onClose: () => this.eventStreams.delete(stream),
    });
    await stream.start();
    this.eventStreams.add(stream);
    return stream;
  }

  /** Close the socket and resolve all event consumers. */
  public async close(): Promise<void> {
    this.closed = true;
    for (const stream of this.eventStreams) stream.close();
    this.eventStreams.clear();
    const socket = await this.socketPromise?.catch(() => undefined);
    socket?.destroy();
    const error = new BoardError('transport_closed', 'Herdr transport was closed');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private async connect(): Promise<Socket> {
    if (this.socketPromise !== undefined) {
      const socket = await this.socketPromise;
      if (!socket.destroyed) return socket;
      this.socketPromise = undefined;
    }
    if (this.closed) throw new BoardError('transport_closed', 'Herdr transport is closed');
    this.socketPromise = new Promise<Socket>((resolve, reject) => {
      const socket = createConnection({ path: this.socketPath });
      this.socket = socket;
      socket.setEncoding('utf8');
      socket.on('connect', () => resolve(socket));
      socket.on('data', (data: string) => this.handleData(data));
      socket.on('error', (error) => {
        this.lastError = errorMessage(error);
        if (!socket.readyState || socket.readyState === 'opening') reject(error);
        this.rejectPending(error);
      });
      socket.on('close', () => {
        this.disconnectCount += 1;
        this.buffer = '';
        this.socket = undefined;
        if (!this.closed) {
          this.socketPromise = undefined;
        }
        this.rejectPending(new BoardError('transport_disconnected', 'Herdr socket disconnected'));
      });
    }).catch((error: unknown) => {
      this.socketPromise = undefined;
      throw new BoardError(
        'transport_connect_failed',
        `Unable to connect to Herdr socket: ${errorMessage(error)}`,
        error,
      );
    });
    return this.socketPromise;
  }

  private handleData(data: string): void {
    this.buffer += data;
    const maxFrameBytes = this.options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    if (Buffer.byteLength(this.buffer, 'utf8') > maxFrameBytes && !this.buffer.includes('\n')) {
      this.frameLimitCount += 1;
      const error = new BoardError(
        'transport_frame_too_large',
        'Herdr frame exceeded the size limit',
      );
      this.lastError = error.message;
      this.rejectPending(error);
      this.socket?.destroy();
      this.socketPromise = undefined;
      return;
    }
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      if (Buffer.byteLength(line, 'utf8') > maxFrameBytes) {
        this.frameLimitCount += 1;
        const error = new BoardError(
          'transport_frame_too_large',
          'Herdr frame exceeded the size limit',
        );
        this.lastError = error.message;
        this.rejectPending(error);
        this.socket?.destroy();
        return;
      }
      const parsed = parseProtocolLine(line);
      if (parsed === undefined) continue;
      if ('id' in parsed) {
        const pending = this.pending.get(parsed.id);
        if (pending === undefined) continue;
        this.pending.delete(parsed.id);
        clearTimeout(pending.timer);
        if ('malformed' in parsed) {
          this.malformedCount += 1;
          this.lastError = parsed.reason;
          pending.reject(new BoardError('protocol_malformed', parsed.reason));
          continue;
        }
        if (parsed.error !== undefined) {
          pending.reject(
            new BoardError(parsed.error.code, parsed.error.message, parsed.error.details),
          );
        } else {
          pending.resolve(parsed.result);
        }
      }
    }
  }

  private rejectPending(error: unknown): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /** Return bounded live counters without exposing socket paths or payloads. */
  public getDiagnostics(): TransportDiagnostics {
    return {
      connected:
        (this.socketPromise !== undefined && !this.closed) ||
        [...this.eventStreams].some((stream) => stream.connected),
      pendingRequests: this.pending.size,
      queuedEvents: [...this.eventStreams].reduce(
        (total, stream) => total + stream.queuedEvents,
        0,
      ),
      requestCount: this.requestCount,
      timeoutCount: this.timeoutCount,
      malformedCount: this.malformedCount,
      frameLimitCount: this.frameLimitCount,
      queueOverflowCount: this.queueOverflowCount,
      disconnectCount: this.disconnectCount,
      lastError: this.lastError,
    };
  }

  private recordEventDiagnostic(kind: EventStreamDiagnostic, message?: string): void {
    if (kind === 'disconnected') this.disconnectCount += 1;
    else if (kind === 'malformed') this.malformedCount += 1;
    else if (kind === 'overflow') this.queueOverflowCount += 1;
    else if (kind === 'frame_limit') this.frameLimitCount += 1;
    if (message !== undefined) this.lastError = message;
  }
}
