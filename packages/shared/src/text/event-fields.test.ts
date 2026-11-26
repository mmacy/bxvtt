/**
 * The event fields, event types, and view names that osrlib 2.6 and 2.7 added, and the older events and views
 * without them. The events marked "captured" are copied from a seeded session on bxapi.
 */
import { describe, expect, it } from 'vitest';
import {
  coinParts,
  coinsPhrase,
  contextFromPlayerView,
  describeEvent,
  describeEvents,
  describeGameEntry,
  describeRejection,
  emptyContext,
  extendContextWithEntryNames,
  memberClass,
  monsterName,
  extendContextWithReferee,
  type PlayerViewLike,
  type TextContext,
} from './index';

const view: PlayerViewLike = {
  party: [
    { id: 'character-0001', name: 'Brenna', class_id: 'fighter', class_name: 'Fighter', level: 1 },
    { id: 'character-0002', name: 'Wren', class_id: 'thief', class_name: 'Thief', level: 1 },
    { id: 'character-0003', name: 'Tomas', class_id: 'cleric', class_name: 'Cleric', level: 1 },
  ],
  encounter: {
    groups: [
      {
        id: 'group-0001',
        label: 'goblin',
        label_plural: 'goblins',
        count: 2,
        members: [
          { id: 'monster-0001', status: 'alive' },
          { id: 'monster-0002', status: 'alive' },
        ],
      },
      {
        id: 'group-0002',
        label: 'Mag Corrie',
        label_plural: 'Mag Corrie',
        count: 1,
        members: [{ id: 'npc-0001', status: 'alive' }],
      },
    ],
  },
};

const ctx: TextContext = contextFromPlayerView(view);

const event = (type: string, code: string, fields: Record<string, unknown>) => ({
  event_type: type,
  code,
  visibility: 'player',
  ...fields,
});

describe('hiding thieves', () => {
  it('says a member tries to hide, but not whether it worked', () => {
    // Captured.
    const line = describeEvent(
      event('hide_attempted', 'battle.hide.attempted', { character_id: 'character-0002' }),
      ctx,
    );
    expect(line.text).toBe('Wren slips into the shadows and tries to hide.');
    expect(line.detail).toBe(
      "The referee rolls in secret, so the party doesn't know yet whether the hide worked.",
    );
    expect(line.visibility).toBe('player');
    expect(line.actorIds).toEqual(['character-0002']);
  });

  it("gives a thief skill's chance as a percentage rolled on d100", () => {
    const hide = describeEvent(
      {
        ...event('detection_rolled', 'exploration.detection.rolled', {
          character_id: 'character-0002',
          kind: 'hide_in_shadows',
          chance: 10,
          roll: 38,
          passed: false,
        }),
        visibility: 'referee',
      },
      ctx,
    );
    expect(hide.text).toBe('Wren tries to hide in shadows and the roll fails.');
    expect(hide.detail).toBe('Rolled 38 on d100 against 10%.');
    const quiet = describeEvent(
      event('detection_rolled', 'exploration.detection.rolled', {
        character_id: 'character-0002',
        kind: 'move_silently',
        chance: 20,
        roll: 7,
        passed: true,
      }),
      ctx,
    );
    expect(quiet.text).toBe('Wren tries to move silently and the roll succeeds.');
    expect(quiet.detail).toBe('Rolled 7 on d100 against 20%.');
  });

  it('labels the hide action', async () => {
    const { battleActionLabel, battleActionDescription } = await import('./labels');
    expect(battleActionLabel('hide')).toBe('Hide');
    expect(battleActionDescription('hide')).toMatch(/thief skills/);
  });

  it('refuses a hide by the declaring member, by name', () => {
    // Captured.
    expect(
      describeRejection(
        { code: 'battle.declaration.hide_not_a_thief', params: { character: 'character-0001' } },
        ctx,
      ),
    ).toBe(
      "Brenna can't hide in shadows. Only a character with thief skills, such as a thief, can hide in battle.",
    );
    expect(
      describeRejection(
        { code: 'battle.declaration.hide_in_front_rank', params: { character: 'character-0002' } },
        ctx,
      ),
    ).toBe(
      "Wren will stand in the front rank this round, so they can't hide. Hide from a rank behind the front, or choose another action.",
    );
  });
});

describe('monsters that break, run, and get away', () => {
  it('says a group breaks and runs, because it is still in the battle', () => {
    expect(
      describeEvent(event('monster_fled', 'battle.side.fled', { group_id: 'group-0001' }), ctx).text,
    ).toBe('The goblins break and run.');
    expect(
      describeEvent(event('monster_fled', 'battle.side.fled', { group_id: 'group-0002' }), ctx).text,
    ).toBe('Mag Corrie breaks and runs.');
  });

  it('says a group escapes when it leaves the battle', () => {
    // Captured: two turned skeletons get away in the round after the turning.
    expect(
      describeEvent(event('monster_escaped', 'battle.side.escaped', { group_id: 'group-0001' }), ctx).text,
    ).toBe('The goblins escape the battle.');
    expect(
      describeEvent(event('monster_escaped', 'battle.side.escaped', { group_id: 'group-0002' }), ctx).text,
    ).toBe('Mag Corrie escapes the battle.');
    expect(
      describeEvent(
        event('monster_escaped', 'battle.side.escaped', { group_id: 'group-0009' }),
        emptyContext(),
      ).text,
    ).toBe('The monsters escape the battle.');
  });

  it("never names an adventure's own undead template in a turning's detail", () => {
    const line = describeEvent(
      event('undead_turned', 'magic.turning.turned', {
        caster_id: 'character-0003',
        roll: 9,
        hd_pool: 5,
        types: [
          { template_id: 'skeleton', column: '1', outcome: 'turn', threshold: 7 },
          { template_id: 'drowned_prior', column: '3', outcome: 'fail', threshold: 11 },
        ],
        affected_ids: ['monster-0001'],
      }),
      ctx,
    );
    expect(line.detail).toBe(
      'Rolled 9 on 2d6. Affected up to 5 Hit Dice. Skeleton: turned, needed 7; Undead: not turned, needed 11.',
    );
  });
});

describe('declarations that fizzle', () => {
  it('says a potion given to drink fizzles, and why', () => {
    const line = describeEvent(
      event('declaration_fizzled', 'magic.potion.fizzled', {
        actor_id: 'character-0003',
        item_id: 'potion_of_healing',
        target_id: 'character-0001',
        group_id: null,
        reason: 'items.use.target_cannot_drink',
      }),
      ctx,
    );
    expect(line.text).toBe("Tomas can't give Brenna a potion of healing to drink and keeps it.");
    expect(line.detail).toBe("Brenna can't act right now and can't drink a potion of healing.");
    expect(line.actorIds).toEqual(['character-0003', 'character-0001']);
  });

  it('says a hand-over fizzles, and why', () => {
    const line = describeEvent(
      event('declaration_fizzled', 'battle.give.fizzled', {
        actor_id: 'character-0002',
        item_id: 'torch',
        target_id: 'character-0001',
        group_id: null,
        reason: 'session.command.member_incapacitated',
      }),
      ctx,
    );
    expect(line.text).toBe("Wren can't hand a torch to Brenna and keeps it.");
    expect(line.detail).toBe("Brenna can't act right now, so Wren can't hand them anything.");
  });

  it('reads without the member the item was for', () => {
    const line = describeEvent(
      event('declaration_fizzled', 'battle.give.fizzled', {
        actor_id: 'character-0002',
        item_id: 'torch',
        target_id: null,
        group_id: null,
        reason: 'battle.declaration.member_out_of_reach',
      }),
      ctx,
    );
    expect(line.text).toBe("Wren can't hand a torch to another party member and keeps it.");
  });
});

describe('coins by denomination', () => {
  it('formats coins as list items and as a phrase', () => {
    expect(coinParts({ pp: 0, gp: 3, ep: 0, sp: 4, cp: 0 })).toEqual(['3 gold pieces', '4 silver pieces']);
    expect(coinParts({ cp: 1 })).toEqual(['1 copper piece']);
    expect(coinsPhrase({ cp: 39 })).toBe('39 copper pieces');
    expect(coinsPhrase({ gp: 3, sp: 4, cp: 2 })).toBe('3 gold pieces, 4 silver pieces, and 2 copper pieces');
    expect(coinsPhrase({})).toBe('no coins');
  });

  it('names copper worth less than 1 gp, never nothing', () => {
    // Captured.
    const granted = describeEvent(
      event('item_acquired', 'exploration.item.acquired', {
        character_id: 'character-0002',
        item_ids: [],
        coins_gp_value: 0,
        coins: { pp: 0, gp: 0, ep: 0, sp: 4, cp: 39 },
        origin: 'grant',
      }),
      ctx,
    );
    expect(granted.text).toBe('Wren receives 4 silver pieces and 39 copper pieces.');
    const loot = describeEvent(
      event('loot_dropped', 'encounter.loot.dropped', {
        item_ids: [],
        coins_gp_value: 0,
        coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 39 },
      }),
      ctx,
    );
    expect(loot.text).toBe('The fallen leave behind 39 copper pieces.');
    expect(loot.detail).toBeUndefined();
  });

  it("lists a share's exact coins with its items", () => {
    const line = describeEvent(
      event('item_acquired', 'exploration.item.acquired', {
        character_id: 'character-0001',
        item_ids: ['rope'],
        coins_gp_value: 2,
        coins: { pp: 0, gp: 2, ep: 0, sp: 5, cp: 16 },
        origin: 'treasure',
      }),
      ctx,
    );
    expect(line.text).toBe(
      'Brenna takes a 50-foot rope, 2 gold pieces, 5 silver pieces, and 16 copper pieces.',
    );
    expect(line.detail).toBe(
      'Every coin is shared out, and the odd ones go to the front of the marching order.',
    );
    expect(line.amount).toBe(2);
  });

  it('reads an event from before osrlib 2.7 by its worth in gold', () => {
    const fields = { character_id: 'character-0001', item_ids: [], coins_gp_value: 30, origin: 'treasure' };
    // As recorded then, with no coins, and as bxapi loads it from an older log, with coins of no denomination.
    for (const extra of [{}, { coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 } }]) {
      const line = describeEvent(
        event('item_acquired', 'exploration.item.acquired', { ...fields, ...extra }),
        ctx,
      );
      expect(line.text).toBe('Brenna takes coins worth 30 gp.');
      expect(line.detail).toMatch(/^Coins count by their worth in whole gold pieces, rounded down\./);
    }
    const small = describeEvent(
      event('loot_dropped', 'encounter.loot.dropped', { item_ids: [], coins_gp_value: 0 }),
      ctx,
    );
    expect(small.text).toBe('The fallen leave a few coins behind.');
  });

  it('describes drops, gifts, removals, goods left behind, and hoards by their coins', () => {
    // Captured.
    expect(
      describeEvent(
        event('items_dropped', 'exploration.item.dropped', {
          character_id: 'character-0002',
          item_ids: [],
          coins_gp_value: 0,
          coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 39 },
        }),
        ctx,
      ).text,
    ).toBe('Wren drops 39 copper pieces.');
    expect(
      describeEvent(
        event('items_given', 'exploration.item.given', {
          character_id: 'character-0002',
          recipient_id: 'character-0003',
          item_ids: [],
          coins_gp_value: 0,
          coins: { pp: 0, gp: 0, ep: 0, sp: 4, cp: 0 },
        }),
        ctx,
      ).text,
    ).toBe('Wren gives 4 silver pieces to Tomas.');
    expect(
      describeEvent(
        event('items_removed', 'session.items.removed', {
          character_id: 'character-0001',
          item_ids: [],
          coins_gp_value: 1,
          coins: { ep: 3 },
        }),
        ctx,
      ).text,
    ).toBe('Brenna loses 3 electrum pieces.');
    expect(
      describeEvent(
        event('items_left_behind', 'exploration.item.left_behind', {
          item_ids: ['chainmail'],
          coins_gp_value: 40,
          coins: { sp: 400 },
        }),
        ctx,
      ).text,
    ).toBe("The party can't carry it all and leaves behind a suit of chainmail and 400 silver pieces.");
    const hoard = describeEvent(
      event('hoard_generated', 'treasure.hoard.generated', {
        cache_ref: 'cache-0001',
        treasure_types: ['C'],
        coins_gp_value: 340,
        coins: { gp: 300, sp: 400 },
        valuable_ids: [],
        magic_item_ids: [],
      }),
      ctx,
    );
    expect(hoard.text).toBe(
      'Treasure is rolled for a treasure cache: 300 gold pieces and 400 silver pieces.',
    );
    expect(hoard.detail).toBe('Treasure types: C. The coins are worth 340 gp.');
  });
});

describe('experience awards', () => {
  // Captured: a first-level fighter with a low prime requisite awarded 5,000 XP.
  const capped = event('xp_awarded', 'session.xp.awarded', {
    character_id: 'character-0001',
    award: 5000,
    modified_award: 4500,
    level_after: 2,
    gained: 3999,
    clamped: true,
  });

  it('reports the experience gained, and says when the one-level limit cut the award', () => {
    const line = describeEvent(capped, ctx);
    expect(line.text).toBe(
      'Brenna gains 3,999 experience points. One award raises a character only one level, so the rest is lost.',
    );
    expect(line.detail).toBe('Base award 5,000, adjusted to 4,500.');
    expect(line.amount).toBe(3999);
  });

  it('reports an uncut award as it was gained', () => {
    const line = describeEvent(
      event('xp_awarded', 'session.xp.awarded', {
        character_id: 'character-0002',
        award: 100,
        modified_award: 100,
        level_after: 1,
        gained: 100,
        clamped: false,
      }),
      ctx,
    );
    expect(line.text).toBe('Wren gains 100 experience points.');
    expect(line.detail).toBeUndefined();
  });

  it('keeps the old wording for an event recorded before osrlib 2.7', () => {
    const line = describeEvent(
      event('xp_awarded', 'session.xp.awarded', {
        character_id: 'character-0001',
        award: 100,
        modified_award: 110,
        level_after: 1,
        gained: null,
        clamped: false,
      }),
      ctx,
    );
    expect(line.text).toBe('Brenna gains 110 experience points.');
    expect(line.amount).toBe(110);
  });

  it("says the limit once when a feed entry also states the member's gain", () => {
    const lines = describeGameEntry(
      { command_type: 'award_xp', events: [capped], xp_gained: { 'character-0001': 3999 } },
      ctx,
    );
    expect(lines.map((line) => line.text)).toEqual([
      'Brenna gains 3,999 experience points. One award raises a character only one level, so the rest is lost.',
    ]);
  });
});

describe('encounter and spawn names', () => {
  it('names every group of an encounter from the event', () => {
    const line = describeEvent(
      event('encounter_started', 'encounter.started', {
        monster_name: 'goblin',
        monster_name_plural: 'goblins',
        count: 3,
        distance_feet: 40,
        party_surprised: false,
        monsters_surprised: false,
        group_labels: ['goblin', 'Mag Corrie'],
        group_labels_plural: ['goblins', 'Mag Corrie'],
        group_counts: [2, 1],
      }),
      emptyContext(),
    );
    expect(line.text).toBe('The party meets 2 goblins and Mag Corrie, 40 feet away.');
  });

  it('reads an older event without group fields by the groups the context knows', () => {
    const line = describeEvent(
      event('encounter_started', 'encounter.started', {
        monster_name: 'goblin',
        monster_name_plural: 'goblins',
        count: 3,
        distance_feet: 40,
        party_surprised: false,
        monsters_surprised: false,
        group_labels: [],
        group_labels_plural: [],
        group_counts: [],
      }),
      ctx,
    );
    expect(line.text).toBe('The party meets 2 goblins and Mag Corrie, 40 feet away.');
  });

  it("names spawned monsters by the template's display name", () => {
    const spawned = (fields: Record<string, unknown>) =>
      describeEvent(
        {
          ...event('monsters_spawned', 'session.monsters.spawned', {
            template_id: 'centipede_giant',
            monster_ids: ['monster-0003', 'monster-0004', 'monster-0005'],
            ...fields,
          }),
          visibility: 'referee',
        },
        emptyContext(),
      ).text;
    expect(spawned({ display_name: 'giant centipede', display_name_plural: 'giant centipedes' })).toBe(
      'The referee spawns 3 giant centipedes.',
    );
    expect(spawned({ display_name: '', display_name_plural: '' })).toBe(
      'The referee spawns 3 centipede giants.',
    );
  });
});

describe('names from the player view', () => {
  it("reads a custom class, a bundled spell and its reverse, a dungeon, and an area by the view's names", () => {
    const named = contextFromPlayerView({
      party: [
        { id: 'character-0001', name: 'Sefa', class_id: 'class-0001', class_name: 'Bog Witch', level: 1 },
      ],
      spell_names: { moon_bolt: 'Moon Bolt', light_mu: 'Light' },
      reversed_spell_names: { light_mu: 'Darkness' },
      dungeons: [{ id: 'priory', name: "The priory on Corvane's Holm" }],
      explored: [
        {
          dungeon_id: 'priory',
          level_number: 1,
          areas: [{ id: 'chapter_house', name: 'Chapter house' }],
        },
      ],
    });
    expect(memberClass('character-0001', named)).toBe('bog witch');
    expect(
      describeEvent(
        event('member_added', 'session.member.added', {
          character_id: 'character-0001',
          name: 'Sefa',
          class_id: 'class-0001',
          level: 1,
        }),
        named,
      ).text,
    ).toBe('Sefa, a level 1 bog witch, joins the party.');
    const cast = (spell: string, reversed: boolean) =>
      describeEvent(
        event('spell_cast', 'magic.cast.cast', {
          caster_id: 'character-0001',
          spell_id: spell,
          mode: 'single',
          reversed,
          target_ids: [],
          manual: false,
        }),
        named,
      ).text;
    expect(cast('moon_bolt', false)).toBe('Sefa casts Moon Bolt.');
    expect(cast('light_mu', true)).toBe('Sefa casts Darkness.');
    expect(cast('sleep', true)).toBe('Sefa casts the reversed form of Sleep.');
    expect(
      describeEvent(
        event('location_entered', 'exploration.location.entered', {
          location_kind: 'area',
          location_id: 'chapter_house',
          level_number: 1,
          dungeon_id: 'priory',
          narrative: null,
          via: null,
          transition_ref: null,
        }),
        named,
      ),
    ).toMatchObject({
      text: 'The party enters the chapter house.',
      detail: "Level 1 of the priory on Corvane's Holm.",
    });
  });

  it('names each creature as the table calls it, without the referee view', () => {
    expect(monsterName('monster-0002', ctx)).toBe('Goblin 2');
    expect(monsterName('npc-0001', ctx)).toBe('Mag Corrie');
    expect(
      describeEvent(
        event('attack_rolled', 'combat.attack.hit', {
          attacker_id: 'npc-0001',
          defender_id: 'character-0001',
          attack_name: 'weapon',
          roll: 15,
          modifier: 0,
          total: 15,
          required: 9,
          defender_ac: 10,
          natural: null,
          back_stab: false,
        }),
        ctx,
      ).text,
    ).toBe('Mag Corrie hits Brenna.');
  });

  it('keeps the catalog names for a view from before bxapi stated them', () => {
    const old = contextFromPlayerView({
      party: [{ id: 'character-0001', name: 'Osric', class_id: 'magic_user' }],
    });
    expect(memberClass('character-0001', old)).toBe('magic-user');
    expect(old.reversedSpells).toBeUndefined();
  });

  it('keeps flag descriptions when a context is copied', () => {
    const referee: TextContext = {
      ...emptyContext(),
      flags: {
        'priory.sluice': { name: 'the sluice flag', setBy: ['entering the sluice room'], readBy: [] },
      },
    };
    const lines = describeEvents(
      [
        {
          ...event('flag_set', 'session.flag.set', { key: 'priory.sluice', value: true }),
          visibility: 'referee',
        },
      ],
      extendContextWithEntryNames(referee, { members: { 'character-0001': 'Brenna' } }),
    );
    expect(lines[0]?.text).toBe('The referee sets the sluice flag to on.');
    expect(lines[0]?.detail).toBe('Also set by entering the sluice room.');
  });
});

describe('refusals of a battle declaration', () => {
  const rej = (code: string, params: Record<string, string | number>) =>
    describeRejection({ code, params }, ctx);

  it("names the declaring member in the kernel's checks", () => {
    expect(rej('combat.attack.out_of_reach', { character: 'character-0002', distance_feet: 20 })).toBe(
      'Wren is 20 feet from the target, too far for a melee attack. Close in first, or use a missile weapon or spell.',
    );
    expect(
      rej('combat.attack.out_of_reach', {
        character: 'character-0003',
        distance_feet: 5,
        target: 'monster-0002',
      }),
    ).toBe(
      'Tomas is 5 feet from Goblin 2, too far to reach in melee. Close in first, or use a missile weapon or spell.',
    );
    expect(
      rej('magic.cast.target_count', { character: 'character-0003', expected: 1, supplied: 3, mode: 'x' }),
    ).toBe("Tomas' spell takes 1 target in this mode, but you chose 3.");
    expect(rej('magic.cast.unknown_target', { character: 'character-0003', target: 'monster-0002' })).toBe(
      "The target Tomas chose has fallen or fled, or it isn't in this encounter. Choose another target.",
    );
    expect(rej('battle.declaration.no_target', { character: 'character-0002', group: 'group-0001' })).toBe(
      'No targets remain in the goblins for Wren to strike. Choose another group.',
    );
    expect(rej('exploration.item.not_carried', { character: 'character-0002', item: 'torch' })).toBe(
      "Wren doesn't have a torch.",
    );
  });

  it('names the member a hand-over was for', () => {
    // Captured.
    expect(
      rej('battle.declaration.target_count', { character: 'character-0002', expected: 1, supplied: 2 }),
    ).toBe(
      "Wren's action needs 1 target, but you chose 2. Choose who drinks the potion, takes the item, or is touched by the staff.",
    );
    expect(
      rej('session.command.member_incapacitated', { character: 'character-0002', target: 'character-0001' }),
    ).toBe("Brenna can't act right now, so Wren can't hand them anything.");
    expect(rej('session.command.member_incapacitated', { character: 'character-0001' })).toBe(
      "Brenna can't act right now.",
    );
  });

  it('refuses a second healing from a staff the same day', () => {
    expect(
      rej('items.use.target_healed_today', {
        character: 'character-0003',
        item: 'staff_of_healing',
        target: 'character-0001',
      }),
    ).toBe(
      'A staff of healing has already healed Brenna today. A staff of healing can heal each creature only once a day.',
    );
  });

  it('reads well without the member', () => {
    expect(describeRejection({ code: 'combat.attack.out_of_reach', params: { distance_feet: 20 } })).toBe(
      'The target is 20 feet away, too far for a melee attack. Close in first, or use a missile weapon or spell.',
    );
    expect(describeRejection({ code: 'battle.declaration.target_count', params: {} })).toBe(
      'That action needs exactly one target. Choose who drinks the potion, takes the item, or is touched by the staff.',
    );
  });
});

describe('creatures named as the table calls them', () => {
  const hit = [
    event('attack_rolled', 'combat.attack.hit', {
      attacker_id: 'character-0001',
      defender_id: 'monster-0002',
      attack_name: 'Sword',
      roll: 16,
      modifier: 1,
      total: 17,
      required: 13,
      defender_ac: 6,
      natural: null,
      back_stab: false,
    }),
    event('damage_dealt', 'combat.damage.dealt', {
      target_id: 'monster-0002',
      attacker_id: 'character-0001',
      amount: 5,
      rolls: [5],
      keys: [],
      non_regenerable: false,
    }),
  ];
  const slain = event('monster_defeated', 'battle.monster.defeated', {
    monster_id: 'monster-0002',
    template_id: 'drowned_prior',
    outcome: 'slain',
    xp: 25,
  });

  it('names the creature a player aimed at, live and in the feed afterward', () => {
    const live = describeEvents(hit, ctx).map((line) => line.text);
    expect(live).toEqual(['Brenna hits Goblin 2 with a sword for 5 damage.']);
    const feed = describeGameEntry(
      {
        command_type: 'resolve_battle_round',
        events: hit,
        names: {
          members: { 'character-0001': 'Brenna' },
          monsters: { 'monster-0002': { label: 'goblin', label_plural: 'goblins', name: 'Goblin 2' } },
        },
      },
      emptyContext(),
    ).map((line) => line.text);
    expect(feed).toEqual(live);
  });

  it('reads an entry from before table names by its label', () => {
    const lines = describeGameEntry(
      {
        command_type: 'resolve_battle_round',
        events: hit,
        names: {
          members: { 'character-0001': 'Brenna' },
          monsters: { 'monster-0002': { label: 'goblin', label_plural: 'goblins' } },
        },
      },
      emptyContext(),
    );
    expect(lines.map((line) => line.text)).toEqual(['Brenna hits a goblin with a sword for 5 damage.']);
  });

  it('keeps a disguised group disguised', () => {
    const disguised = contextFromPlayerView({
      encounter: {
        groups: [
          {
            id: 'group-0001',
            label: 'robed corpse',
            label_plural: 'robed corpses',
            count: 1,
            members: [{ id: 'monster-0002', status: 'alive' }],
          },
        ],
      },
    });
    expect(describeEvent(slain, disguised).text).toBe('A robed corpse is slain.');
    const later = extendContextWithEntryNames(emptyContext(), {
      monsters: {
        'monster-0002': { label: 'robed corpse', label_plural: 'robed corpses', name: 'Robed corpse' },
      },
    });
    expect(describeEvents([slain], later)[0]?.text).toBe('A robed corpse is slain.');
    const two = extendContextWithEntryNames(emptyContext(), {
      monsters: {
        'monster-0002': { label: 'robed corpse', label_plural: 'robed corpses', name: 'Robed corpse 2' },
      },
    });
    expect(describeEvents([slain], two)[0]?.text).toBe('Robed corpse 2 is slain.');
  });

  it("keeps a referee's real name for an NPC, and the table name for a monster", () => {
    const referee = extendContextWithReferee(ctx, {
      monsters: [{ id: 'monster-0002', template: { id: 'goblin', name: 'Goblin' } }],
      npcs: [{ id: 'npc-0001', name: 'Aldric', class_id: 'fighter', level: 2 }],
    });
    expect(monsterName('monster-0002', referee)).toBe('Goblin 2');
    expect(monsterName('npc-0001', referee)).toBe('Aldric');
    const entry = extendContextWithEntryNames(referee, {
      monsters: { 'npc-0001': { label: 'Mag Corrie', label_plural: 'Mag Corrie', name: 'Mag Corrie' } },
    });
    expect(monsterName('npc-0001', entry)).toBe('Aldric');
    expect(monsterName('npc-0001', contextFromPlayerView(view, referee))).toBe('Aldric');
  });
});
