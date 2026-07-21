import { describe, expect, test } from 'bun:test';

import type { ViewPreferences } from '@/config/schema';

const preferences: ViewPreferences = {
  showUnknown: true,
  compact: false,
  detailPosition: 'horizontal',
};

describe('view preference keyboard actions', () => {
  test('maps u, s, and p to independent preference toggles', async () => {
    const module = await import('@/ui/board-actions');
    expect(typeof module.preferenceForKey).toBe('function');
    expect(module.preferenceForKey(preferences, 'u')).toEqual({
      ...preferences,
      showUnknown: false,
    });
    expect(module.preferenceForKey(preferences, 's')).toEqual({ ...preferences, compact: true });
    expect(module.preferenceForKey(preferences, 'p')).toEqual({
      ...preferences,
      detailPosition: 'vertical',
    });
    expect(module.preferenceForKey(preferences, 't')).toBeUndefined();
  });
});
