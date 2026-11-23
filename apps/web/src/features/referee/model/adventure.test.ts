import { emptyContext, extendContextWithReferee } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import bell from '../../../../../../adventures/the-drowned-bell.json';
import {
  areaAt,
  areaCenter,
  asAdventure,
  doorNow,
  doorsAround,
  edgeKey,
  edgeRef,
  findArea,
  findLevel,
  trapStatus,
  type Adventure,
  type PlayRecord,
} from './adventure';
import {
  clauseText,
  conditionText,
  consequenceText,
  encounterText,
  flagUses,
  flagUseTooltip,
  patternText,
  trapText,
} from './describe';

const adventure = asAdventure(bell.payload as unknown as Record<string, unknown>) as Adventure;
const level1 = findLevel(adventure, 'priory', 1);
if (!level1) throw new Error('The Drowned Bell has no level 1.');
const ctx = extendContextWithReferee(emptyContext(), { adventure });

function record(partial: Partial<PlayRecord> = {}): PlayRecord {
  const none = new Set<string>();
  return {
    foundTraps: none,
    foundTricks: none,
    sprungTraps: none,
    removedTraps: none,
    emptiedCaches: none,
    resolvedEncounters: none,
    generatedTreasureAreas: none,
    generatedLairHoards: none,
    alertedAreas: none,
    explored: none,
    doors: {},
    ...partial,
  };
}

describe('edge keys', () => {
  it('names each edge once, from the cell on its south or east side', () => {
    expect(edgeKey(3, 4, 'south')).toBe('3,5:north');
    expect(edgeKey(3, 4, 'east')).toBe('4,4:west');
    expect(edgeKey(3, 4, 'west')).toBe('3,4:west');
    expect(edgeRef('priory', 2, 6, 17, 'east')).toBe('priory:2:7,17:west');
  });
});

describe('areas and doors', () => {
  it('finds the keyed area that holds a cell, and none in a corridor', () => {
    expect(areaAt(level1, 14, 22)?.name).toBe('Gatehouse stair');
    expect(areaAt(level1, 0, 0)).toBeNull();
  });

  it('lists the doors on an area’s walls with what lies beyond', () => {
    const guardroom = findArea(adventure, 'guardroom');
    if (!guardroom) throw new Error('no guardroom');
    const doors = doorsAround(level1, guardroom.area.cells, {}, 'priory');
    expect(doors.map((d) => d.direction).sort()).toEqual(['east', 'north']);
    expect(doors.every((d) => d.state === null)).toBe(true);
  });

  it('reads a door’s recorded state over the state it starts in', () => {
    const wardens = findArea(adventure, 'wardens_cell');
    if (!wardens) throw new Error('no warden’s cell');
    const spec = { kind: 'normal' as const, stuck: false, locked: true, starts_open: false, requires: null };
    expect(doorNow({ spec, state: null })).toMatchObject({ open: false, locked: true, secret: false });
    expect(
      doorNow({
        spec,
        state: { open: true, unlocked: true, wedged: false, discovered: false, opened_by_party: true },
      }),
    ).toMatchObject({ open: true, locked: false });
    const secret = { ...spec, kind: 'secret' as const, locked: false };
    expect(doorNow({ spec: secret, state: null })).toMatchObject({ secret: true, found: false });
  });

  it('picks a cell inside the area to center on', () => {
    const chapter = findArea(adventure, 'chapter_house');
    if (!chapter) throw new Error('no chapter house');
    const [x, y] = areaCenter(chapter.area);
    expect(chapter.area.cells.some((c) => c[0] === x && c[1] === y)).toBe(true);
  });

  it('reports a trap removed over sprung over found', () => {
    const ref = 'priory:1:iron_chest';
    expect(trapStatus(record(), ref)).toBe('hidden');
    expect(trapStatus(record({ foundTraps: new Set([ref]) }), ref)).toBe('found');
    expect(trapStatus(record({ foundTraps: new Set([ref]), sprungTraps: new Set([ref]) }), ref)).toBe(
      'sprung',
    );
    expect(trapStatus(record({ sprungTraps: new Set([ref]), removedTraps: new Set([ref]) }), ref)).toBe(
      'removed',
    );
  });
});

describe('descriptions', () => {
  it('describes trigger patterns and conditions by name', () => {
    const talk = adventure.triggers.find((t) => t.id === 'drain_folk_talk');
    expect(talk && patternText(talk.when, ctx)).toBe('The party enters the Drain Folk warren');
    const report = adventure.quests.find((q) => q.id === 'red_thumbs')?.objectives[1];
    expect(report && clauseText(report.when, ctx, adventure)).toBe(
      'The party returns to Hollin Ferry, while the flag set when Gashnak One-Ear is slain or routed reads “dead”.',
    );
    expect(conditionText({ condition_type: 'has_item', item_id: 'holy_water', consumes: true }, ctx)).toBe(
      'a member carries a vial of holy water, which is used up',
    );
  });

  it('describes consequences and rewards, with party selectors in words', () => {
    const sluice = adventure.triggers.find((t) => t.id === 'sluice_runs');
    const lines = sluice?.consequences.map((c) => consequenceText(c, ctx, adventure));
    expect(lines).toEqual([
      'Set a story flag to “open”. It opens a way out on level 2.',
      'Open and unlock the door on the east side of cell 6, 17 on level 2.',
    ]);
    const reward = adventure.quests.find((q) => q.id === 'red_thumbs')?.rewards[1];
    expect(reward && consequenceText(reward, ctx, adventure)).toBe(
      'Award 100 experience points to each living member.',
    );
  });

  it('describes traps and keyed encounters', () => {
    const chest = findArea(adventure, 'wardens_cell')?.area.features.find((f) => f.id === 'iron_chest');
    expect(chest?.trap && trapText(chest.trap)).toBe(
      'It deals 2d4 damage. A save versus death ray or poison avoids it.',
    );
    const warden = findArea(adventure, 'wardens_cell')?.area.encounter;
    expect(warden && encounterText(warden, adventure)).toBe('Gashnak One-Ear and 2 goblins');
    const pit = findArea(adventure, 'bell_pit')?.area.encounter;
    expect(pit && encounterText(pit, adventure)).toBe(
      '1 drowned prior (seen as a robed corpse) and 2 zombies',
    );
  });
});

describe('flagUses', () => {
  it('says what sets each flag and what reads it', () => {
    const uses = flagUses(adventure, ctx);
    expect(uses.get('priory.gashnak')).toEqual([
      'Set to “dead” when Gashnak One-Ear is slain or routed.',
      'Checked by the objective Report to Reeve Tamsin Hale.',
    ]);
    expect(uses.get('quest.bell')).toEqual(['Set to “silenced” as a reward for Silence the drowned bell.']);
  });
});

describe('flagUseTooltip', () => {
  it('gives the first use of a flag without its period, and nothing for a flag no trigger, quest, or gate uses', () => {
    const uses = flagUses(adventure, ctx);
    expect(flagUseTooltip(uses, 'priory.gashnak')).toBe(
      'Set to “dead” when Gashnak One-Ear is slain or routed',
    );
    expect(flagUseTooltip(uses, 'made.up.during.play')).toBeUndefined();
  });
});

describe('wording in sentences', () => {
  it('names areas with an article and adventure items after their owner without one', async () => {
    const { areaInSentence } = await import('./describe');
    expect(areaInSentence('Gatehouse stair')).toBe('the gatehouse stair');
    expect(areaInSentence('Drain Folk warren')).toBe('the Drain Folk warren');
    expect(areaInSentence('The bell pit')).toBe('the bell pit');
    const { default: toll } = await import('../../../../../../adventures/the-toll-bridge.json');
    const tollAdventure = asAdventure(toll.payload as unknown as Record<string, unknown>) as Adventure;
    const tollCtx = extendContextWithReferee(emptyContext(), { adventure: tollAdventure });
    const quest = tollAdventure.quests.find((q) => q.id === 'millers_strongbox');
    const kingsway = tollAdventure.quests.find((q) => q.id === 'open_the_kingsway');
    const find = quest?.objectives[0];
    expect(find && clauseText(find.when, tollCtx, tollAdventure)).toBe(
      "A member gets Miller Aske's strongbox.",
    );
    const portcullis = kingsway?.objectives.find((o) => o.id === 'raise_portcullis');
    expect(portcullis && clauseText(portcullis.when, tollCtx, tollAdventure)).toBe(
      'The party enters the east gatehouse.',
    );
  });
});
