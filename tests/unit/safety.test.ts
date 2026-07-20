import { describe, expect, test } from 'bun:test';

import { sanitizeTerminalText, sanitizeTitle } from '@/safety/sanitize-terminal';

describe('terminal safety', () => {
  test('removes ANSI and control injection while preserving readable text', () => {
    const result = sanitizeTerminalText('\u001b]0;secret\u0007\u001b[31mDone\u001b[0m\u0007', 100);
    expect(result.text).toBe('Done');
  });

  test('bounds processed bytes', () => {
    const result = sanitizeTerminalText('😀😀😀', 5);
    expect(result.truncated).toBe(true);
    expect(new TextEncoder().encode(result.text).byteLength).toBeLessThanOrEqual(5);
  });

  test('normalizes spinner title glyphs', () => {
    expect(sanitizeTitle('⠋ running tests ')).toBe('running tests');
  });

  test('removes bidi and zero-width display controls', () => {
    expect(sanitizeTerminalText('safe\u202Ehidden\u200B text', 100).text).toBe('safehidden text');
  });
});
