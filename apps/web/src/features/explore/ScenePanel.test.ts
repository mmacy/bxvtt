import { emptyContext, extendContextWithCatalog } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { enteredText } from './ScenePanel';

describe('enteredText', () => {
  it('announces a new area in the feed’s words, with its article', () => {
    const ctx = extendContextWithCatalog(emptyContext(), { areas: [{ id: 'kitchen', name: 'Kitchen' }] });
    const here = {
      dungeon_id: 'priory',
      level_number: 1,
      position: [3, 18] as [number, number],
      area: null,
      caches: [],
      features: [],
      transitions: [],
      traps: [],
      pile: false,
    };
    expect(enteredText('kitchen', here, ctx)).toBe('The party enters the kitchen.');
  });
});
