import { emptyContext } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { takeOutcome } from './Aftermath';
import { quietRound } from './EncounterPanel';
import type { AnyEvent } from './playback';

describe('taking from the aftermath', () => {
  it('says there was nothing to pick up when nobody took anything', () => {
    const events: AnyEvent[] = [
      {
        event_type: 'item_acquired',
        code: 'exploration.item.acquired',
        character_id: 'character-0001',
        item_ids: [],
        coins_gp_value: 0,
      },
    ];
    expect(takeOutcome(events, emptyContext())).toEqual({
      tone: 'info',
      text: 'There was nothing to pick up.',
    });
    expect(takeOutcome([], emptyContext()).text).toBe('There was nothing to pick up.');
  });

  it('says who took what', () => {
    const events: AnyEvent[] = [
      {
        event_type: 'item_acquired',
        code: 'exploration.item.acquired',
        character_id: 'character-0001',
        item_ids: [],
        coins_gp_value: 2,
      },
    ];
    const outcome = takeOutcome(events, emptyContext());
    expect(outcome.tone).toBe('success');
    expect(outcome.text).toMatch(/2 gp/);
  });
});

describe('a quiet round in an encounter', () => {
  it('says the party waited and how the monsters bear themselves', () => {
    const game = fixtureSnapshot('encounter', 'player').game;
    const encounter = game?.view.encounter;
    if (!encounter) throw new Error('No encounter.');
    expect(quietRound('wait', { ...encounter, stance: 'indifferent' })).toBe(
      'The party waits a round. The goblins pay the party no mind.',
    );
  });
});
