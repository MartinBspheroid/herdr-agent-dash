import { describe, expect, test } from 'bun:test';

import { layoutForWidth } from '@/ui/layout';

describe('responsive layout', () => {
  test('supports the compact, standard, and wide PRD breakpoints', () => {
    expect(layoutForWidth(60)).toBe('compact');
    expect(layoutForWidth(100)).toBe('standard');
    expect(layoutForWidth(140)).toBe('wide');
    expect(layoutForWidth(200)).toBe('wide');
  });
});
