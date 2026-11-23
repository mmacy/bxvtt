import { emptyContext, extendContextWithCatalog } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { enteredText, thingsHere, trapSentence } from './ScenePanel';

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

describe('scene helpers', () => {
  it('names features on the folded bar', () => {
    expect(thingsHere(1)).toBe('1 feature here');
    expect(thingsHere(3)).toBe('3 features here');
  });

  it('describes room and treasure traps without ambiguous pronouns', () => {
    expect(trapSentence({ kind: 'treasure', trigger: 'open', state: 'found' })).toBe(
      'You found a trap on the treasure. The trap springs when opened.',
    );
    expect(trapSentence({ kind: 'room', trigger: 'enter', state: 'found' })).toBe(
      'You found a trap in this room. The trap springs when someone enters.',
    );
    expect(trapSentence({ kind: 'treasure', trigger: 'open', state: 'sprung' })).toBe(
      'A trap on the treasure has already sprung.',
    );
    expect(trapSentence({ kind: 'room', trigger: 'enter', state: 'removed' })).toBe(
      'A trap in this room has been disarmed.',
    );
  });
});
