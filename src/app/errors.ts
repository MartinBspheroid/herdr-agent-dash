/** Structured error used at package boundaries and in user-facing diagnostics. */
export class BoardError extends Error {
  public readonly code: string;
  public readonly causeValue: unknown;

  /** Create an error with a stable code and safe human-readable message. */
  public constructor(code: string, message: string, causeValue?: unknown) {
    super(message);
    this.name = 'BoardError';
    this.code = code;
    this.causeValue = causeValue;
  }
}

/** Convert unknown thrown values into a bounded diagnostic message. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 400);
  }
  if (typeof error === 'string') {
    return error.slice(0, 400);
  }
  return 'Unknown error';
}
