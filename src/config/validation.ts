/** JSON object accepted by the optional config loader. */
export type JsonObject = Record<string, unknown>;

/** Check whether a value is a non-array JSON object. */
export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read a nested config object or record a path-specific warning. */
export function objectOrDefault(value: unknown, path: string, warnings: string[]): JsonObject {
  if (value === undefined) return {};
  if (isRecord(value)) return value;
  warnings.push(`${path}: expected an object`);
  return {};
}

/** Validate a boolean config value. */
export function booleanValue(
  value: unknown,
  fallback: boolean,
  path: string,
  warnings: string[],
): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  warnings.push(`${path}: expected a boolean`);
  return fallback;
}

/** Validate an integer within a configured safety range. */
export function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  path: string,
  warnings: string[],
): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max)
    return value;
  warnings.push(`${path}: expected an integer from ${min} to ${max}`);
  return fallback;
}

/** Validate a string array without accepting arbitrary JSON values. */
export function stringArray(
  value: unknown,
  fallback: readonly string[],
  path: string,
  warnings: string[],
): readonly string[] {
  if (value === undefined) return fallback;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  warnings.push(`${path}: expected an array of strings`);
  return fallback;
}

/** Validate a string enum and include accepted choices in diagnostics. */
export function enumValue<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
  path: string,
  warnings: string[],
): T {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && choices.includes(value as T)) return value as T;
  warnings.push(`${path}: expected one of ${choices.join(', ')}`);
  return fallback;
}
