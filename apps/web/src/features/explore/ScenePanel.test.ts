import { emptyContext, extendContextWithCatalog } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import {
  enteredText,
  roomTrapSentence,
  thingsHere,
  treasureMoreLabel,
  treasureTrapBadge,
} from './ScenePanel';

describe('enteredText', () => {
  it('announces a new area in the feed’s words, with its article', () => {
    const ctx = extendContextWithCatalog(emptyContext(), { areas: [{ id: 'kitchen', name: 'Kitchen' }] });
    const here = { dungeonId: 'priory', levelNumber: 1 };
    expect(enteredText('kitchen', here, ctx)).toBe('The party enters the kitchen.');
  });
});

describe('scene helpers', () => {
  it('counts what is here on the folded bar', () => {
    expect(thingsHere(1)).toBe('1 thing here');
    expect(thingsHere(3)).toBe('3 things here');
  });

  it('says who found a room trap, and what state it is in', () => {
    expect(roomTrapSentence('found')).toBe('The party found a trap in this room.');
    expect(roomTrapSentence('sprung')).toBe('The trap in this room has sprung.');
    expect(roomTrapSentence('removed')).toBe('The trap in this room is disarmed.');
  });

  it('marks a found treasure trap as a warning, and a spent one as neutral', () => {
    expect(treasureTrapBadge('found')).toEqual({ label: 'Trapped', tone: 'warning', icon: 'trap' });
    expect(treasureTrapBadge('sprung')).toEqual({ label: 'Trap sprung', tone: 'neutral' });
    expect(treasureTrapBadge('removed')).toEqual({ label: 'Trap disarmed', tone: 'neutral' });
  });

  it('gives each treasure’s More menu a distinct name when several lie here', () => {
    const casket = { description: 'A casket of silver and crystal, its lid inlaid with pearl.' };
    expect(treasureMoreLabel(casket, 1)).toBe('More for this treasure');
    expect(treasureMoreLabel(casket, 2)).toBe('More for A casket of silver and crystal, its lid…');
    expect(treasureMoreLabel({ description: '' }, 2)).toBe('More for this treasure');
  });
});
