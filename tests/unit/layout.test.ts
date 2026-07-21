import { describe, expect, test } from 'bun:test';

import { layoutForWidth } from '@/ui/layout';

describe('responsive layout', () => {
  test('supports the compact, standard, and wide PRD breakpoints', () => {
    expect(layoutForWidth(60)).toBe('compact');
    expect(layoutForWidth(100)).toBe('standard');
    expect(layoutForWidth(140)).toBe('wide');
    expect(layoutForWidth(200)).toBe('wide');
  });

  test('allows persistent compact mode to override a wide terminal', () => {
    expect(layoutForWidth(200, true)).toBe('compact');
  });

  test('uses stable horizontal and vertical content directions', async () => {
    const module = await import('@/ui/layout');
    expect(typeof module.contentDirection).toBe('function');
    expect(module.contentDirection('horizontal')).toBe('row');
    expect(module.contentDirection('vertical')).toBe('column');
  });

  test('limits compact mode to the four high-value columns', async () => {
    const module = await import('@/ui/table-layout');
    expect(typeof module.visibleColumnsForLayout).toBe('function');
    expect(
      module.visibleColumnsForLayout(
        ['state', 'agent', 'location', 'signal', 'repository', 'branch'],
        'compact',
      ),
    ).toEqual(['state', 'agent', 'location', 'signal']);
  });
});
