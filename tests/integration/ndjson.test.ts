import { describe, expect, test } from 'bun:test';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NdjsonHerdrTransport } from '@/herdr/ndjson-client';

describe('NDJSON Herdr transport', () => {
  test('correlates requests and receives subscribed events', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'herdr-board-socket-'));
    const socketPath = join(directory, 'herdr.sock');
    const server = createServer((socket) => {
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('data', (data: string) => {
        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.length === 0) continue;
          const request = JSON.parse(line) as {
            readonly id: string;
            readonly method: string;
            readonly params: {
              readonly subscriptions?: readonly { readonly type: string }[];
            };
          };
          socket.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
          if (request.method === 'session.snapshot') expect(request.params).toEqual({});
          if (request.method === 'events.subscribe') {
            expect(request.params?.subscriptions?.[0]?.type).toBe('pane.updated');
            socket.write(
              `${JSON.stringify({ event: 'pane.updated', payload: { pane_id: 'p1' } })}\n`,
            );
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const transport = new NdjsonHerdrTransport(socketPath);
    try {
      const response = await transport.request<unknown>('session.snapshot');
      expect(response).toEqual({});
      const events = await transport.subscribe([{ type: 'pane.updated' }]);
      const iterator = events[Symbol.asyncIterator]();
      const event = await iterator.next();
      expect(event.value).toEqual({ event: 'pane.updated', payload: { pane_id: 'p1' } });
    } finally {
      await transport.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('opens subscriptions on a dedicated socket after ordinary requests', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'herdr-board-dedicated-events-'));
    const socketPath = join(directory, 'herdr.sock');
    const server = createServer((socket) => {
      let firstMethod: string | undefined;
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('data', (data: string) => {
        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.length === 0) continue;
          const request = JSON.parse(line) as { readonly id: string; readonly method: string };
          firstMethod ??= request.method;
          if (request.method === 'events.subscribe' && firstMethod !== 'events.subscribe') continue;
          socket.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const transport = new NdjsonHerdrTransport(socketPath, { requestTimeoutMs: 25 });
    try {
      await transport.request('session.snapshot');
      await expect(transport.subscribe([{ type: 'pane.updated' }])).resolves.toBeDefined();
    } finally {
      await transport.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('rejects malformed response envelopes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'herdr-board-malformed-'));
    const socketPath = join(directory, 'herdr.sock');
    const server = createServer((socket) => {
      socket.setEncoding('utf8');
      socket.on('data', (data: string) => {
        const request = JSON.parse(data.trim()) as { readonly id: string };
        socket.write(`${JSON.stringify({ id: request.id, error: { code: 'denied' } })}\n`);
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const transport = new NdjsonHerdrTransport(socketPath, { requestTimeoutMs: 100 });
    try {
      await expect(transport.request('session.snapshot')).rejects.toMatchObject({
        code: 'protocol_malformed',
      });
    } finally {
      await transport.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('times out an unanswered request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'herdr-board-timeout-'));
    const socketPath = join(directory, 'herdr.sock');
    const server = createServer(() => undefined);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const transport = new NdjsonHerdrTransport(socketPath, { requestTimeoutMs: 10 });
    try {
      await expect(transport.request('session.snapshot')).rejects.toMatchObject({
        code: 'transport_timeout',
      });
      expect(transport.getDiagnostics?.().timeoutCount).toBe(1);
    } finally {
      await transport.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('bounds event backlog and closes the event stream on overflow', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'herdr-board-queue-'));
    const socketPath = join(directory, 'herdr.sock');
    const server = createServer((socket) => {
      socket.setEncoding('utf8');
      socket.on('data', (data: string) => {
        const request = JSON.parse(data.trim()) as { readonly id: string };
        socket.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
        socket.write(`${JSON.stringify({ event: 'pane.updated', payload: { pane_id: 'p1' } })}\n`);
        socket.write(`${JSON.stringify({ event: 'pane.updated', payload: { pane_id: 'p2' } })}\n`);
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const transport = new NdjsonHerdrTransport(socketPath, { maxEventQueue: 1 });
    try {
      const events = await transport.subscribe([{ type: 'pane.updated' }]);
      const iterator = events[Symbol.asyncIterator]();
      expect((await iterator.next()).done).toBe(false);
      expect((await iterator.next()).done).toBe(true);
    } finally {
      await transport.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('does not carry a partial response into the next socket connection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'herdr-board-reconnect-'));
    const socketPath = join(directory, 'herdr.sock');
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      const connection = connections;
      socket.setEncoding('utf8');
      socket.on('data', (data: string) => {
        const request = JSON.parse(data.trim()) as { readonly id: string };
        if (connection === 1) {
          socket.write('{"id":"partial');
          socket.destroy();
          return;
        }
        socket.write(`${JSON.stringify({ id: request.id, result: { recovered: true } })}\n`);
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const transport = new NdjsonHerdrTransport(socketPath, { requestTimeoutMs: 100 });
    try {
      await expect(transport.request('session.snapshot')).rejects.toMatchObject({
        code: 'transport_disconnected',
      });
      await expect(transport.request('session.snapshot')).resolves.toEqual({ recovered: true });
    } finally {
      await transport.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
