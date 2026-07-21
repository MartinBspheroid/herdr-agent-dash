import { describe, expect, test } from 'bun:test';

import type { ViewPreferences } from '@/config/schema';

const preferences: ViewPreferences = {
  showUnknown: true,
  compactPopup: false,
  popupOrientation: 'horizontal',
};

describe('view preference keyboard actions', () => {
  test('maps u, s, and p to unknown visibility and popup geometry', async () => {
    const module = await import('@/ui/board-actions');
    expect(typeof module.preferenceForKey).toBe('function');
    expect(module.preferenceForKey(preferences, 'u')).toEqual({
      ...preferences,
      showUnknown: false,
    });
    expect(module.preferenceForKey(preferences, 's')).toEqual({
      ...preferences,
      compactPopup: true,
    });
    expect(module.preferenceForKey(preferences, 'p')).toEqual({
      ...preferences,
      popupOrientation: 'vertical',
    });
    expect(module.preferenceForKey(preferences, 't')).toBeUndefined();
  });

  test('maps persistent popup preferences to stable outer dimensions', async () => {
    const module = await import('@/ui/board-actions');
    expect(typeof module.popupGeometry).toBe('function');
    expect(module.popupGeometry(preferences)).toEqual({ width: '90%', height: '85%' });
    expect(module.popupGeometry({ ...preferences, compactPopup: true })).toEqual({
      width: 120,
      height: 32,
    });
    expect(
      module.popupGeometry({
        ...preferences,
        compactPopup: true,
        popupOrientation: 'vertical',
      }),
    ).toEqual({ width: 80, height: 48 });
  });
});
