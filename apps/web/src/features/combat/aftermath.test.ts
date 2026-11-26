import { emptyContext } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { takeOutcome } from './Aftermath';
import { summarizeFight } from './fight';
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

  it('counts coins worth less than 1 gp as something taken', () => {
    const events: AnyEvent[] = [
      {
        event_type: 'item_acquired',
        code: 'exploration.item.acquired',
        character_id: 'character-0001',
        item_ids: [],
        coins_gp_value: 0,
        coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 7 },
      },
    ];
    const outcome = takeOutcome(events, emptyContext());
    expect(outcome.tone).toBe('success');
    expect(outcome.text).toMatch(/7 copper pieces|7 cp/);
  });

  it('says who took what', () => {
    const events: AnyEvent[] = [
      {
        event_type: 'item_acquired',
        code: 'exploration.item.acquired',
        character_id: 'character-0001',
        item_ids: [],
        // An event from before osrlib 2.7 states only the gp value.
        coins_gp_value: 2,
      },
    ];
    const outcome = takeOutcome(events, emptyContext());
    expect(outcome.tone).toBe('success');
    expect(outcome.text).toMatch(/2 gp/);
  });
});

describe('how a fight ended', () => {
  const ended = (code: string, extra: AnyEvent[] = []): AnyEvent[] => [
    ...extra,
    { event_type: 'battle_ended', code },
  ];

  it('leaves the sentence out when the title already says it', () => {
    const won = summarizeFight(ended('battle.ended.victory'), emptyContext());
    expect(won.title).toBe('The monsters are beaten');
    expect(won.sentence).toBe('');
    const fled = summarizeFight(ended('battle.ended.fled'), emptyContext());
    expect(fled.title).toBe('The party escaped');
    expect(fled.sentence).toBe('');
    const quiet = summarizeFight([], emptyContext());
    expect(quiet.title).toBe('Encounter ended');
    expect(quiet.sentence).toBe('');
  });

  it('says every member has fallen in a defeat', () => {
    expect(summarizeFight(ended('battle.ended.defeat'), emptyContext()).sentence).toBe(
      'Every party member has fallen.',
    );
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
