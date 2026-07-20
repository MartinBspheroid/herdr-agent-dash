/** A small async queue that lets a socket event stream expose AsyncIterable events. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  /** Create a queue with an explicit backlog limit. */
  public constructor(private readonly maxSize = 1_024) {}

  /** Return the current number of queued values without consuming them. */
  public get size(): number {
    return this.values.length;
  }

  /** Add one value unless the queue is closed or its backlog is full. */
  public push(value: T): boolean {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter({ done: false, value });
      return true;
    }
    if (this.closed || this.values.length >= this.maxSize) return false;
    this.values.push(value);
    return true;
  }

  /** End the stream and resolve pending readers. */
  public close(): void {
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ done: true, value: undefined });
    }
  }

  /** Read the next queued item. */
  public next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Return this queue as its own async iterator. */
  public [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: async () => this.next() };
  }
}
