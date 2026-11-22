import type { MemberView } from '@bxvtt/shared/bxapi';
import { describe, expect, it } from 'vitest';
import { NO_LIGHT_TEXT, partyLightFrom } from './light';
import { fixtureSnapshot } from './testing/fixtures';

const party = fixtureSnapshot('exploring', 'player').game?.view.party ?? [];
const [brenna] = party as MemberView[];

describe('partyLightFrom', () => {
  it('says the party has no light when nothing burns', () => {
    expect(partyLightFrom([], party, {}).text).toBe(NO_LIGHT_TEXT);
  });

  it('names the source from the light event and the time left', () => {
    if (!brenna) throw new Error('The fixture has no party.');
    const light = partyLightFrom([{ kind: 'light', character_id: brenna.id, remaining_rounds: 360 }], party, {
      [brenna.id]: 'lantern',
    });
    expect(light.lit).toBe(true);
    expect(light.text).toBe(`${brenna.name}'s lantern, about 6 turns left`);
  });

  it('lets magical darkness win over any light', () => {
    if (!brenna) throw new Error('The fixture has no party.');
    const light = partyLightFrom(
      [
        { kind: 'light', character_id: brenna.id, remaining_rounds: 60 },
        { kind: 'darkness', character_id: brenna.id, remaining_rounds: 10 },
      ],
      party,
      {},
    );
    expect(light.lit).toBe(false);
    expect(light.text).toBe('Magical darkness covers the party.');
  });
});
