import { describe, expect, it } from 'vitest';
import {
  commandFieldOptionLabel,
  commandFieldText,
  commandInfo,
  contextFromPlayerView,
  describeEvent,
  describeEvents,
  describeRejection,
  describeRejections,
  emptyContext,
  extendContextWithCatalog,
  extendContextWithEvents,
  extendContextWithReferee,
  humanizeMessage,
  type TextContext,
} from './index';

const party = {
  party: [
    { id: 'character-0001', name: 'Brenna', class_id: 'fighter', level: 1 },
    { id: 'character-0002', name: 'Tomas', class_id: 'cleric', level: 1 },
    {
      id: 'character-0003',
      name: 'Wren',
      class_id: 'thief',
      level: 1,
      inventory: {
        items: [
          {
            instance_type: 'magic_item',
            instance_id: 'magic-item-0001',
            display: 'a potion',
            quantity: 1,
            identified: false,
          },
        ],
        valuables: [
          {
            instance_type: 'valuable',
            instance_id: 'valuable-0001',
            kind: 'gem',
            name: 'Ruby',
            value_gp: 100,
          },
        ],
      },
    },
    { id: 'character-0004', name: 'Ilsa', class_id: 'magic_user', level: 1 },
  ],
  encounter: { groups: [{ id: 'group-0001', label: 'goblin', label_plural: 'goblins', count: 3 }] },
  town_name: 'Threshold',
};

const ctx: TextContext = contextFromPlayerView(party);
const refCtx = extendContextWithReferee(ctx, {
  monsters: [
    {
      id: 'monster-0001',
      template: { id: 'goblin', name: 'Goblin', display_name: 'goblin', display_name_plural: 'goblins' },
    },
  ],
  npcs: [{ id: 'npc-0001', name: 'Aldric', class_id: 'fighter', level: 2 }],
  adventure: {
    town: { name: 'Threshold' },
    dungeons: [
      {
        id: 'barrow',
        name: 'The Barrow',
        levels: [{ number: 1, areas: [{ id: 'guard_room', name: 'Guard room' }] }],
      },
    ],
    items: [{ id: 'jade-idol', name: 'Jade idol' }],
  },
});

const rej = (
  code: string,
  params: Record<string, string | number | Array<string | number>> = {},
  context = ctx,
) => describeRejection({ code, params }, context);

describe('rejections', () => {
  it('names the member and says what to do', () => {
    expect(rej('battle.declaration.not_in_front_rank', { character: 'character-0003' })).toBe(
      "Wren isn't in the front rank, so they can't attack in melee. Close with the monsters first, or use a missile weapon or spell.",
    );
  });

  it.each([
    [
      'exploration.move.blocked',
      { direction: 'north' },
      'A wall or a closed door blocks the way north. Open a door first, or choose another direction.',
    ],
    [
      'exploration.door.no_door',
      { direction: 'east' },
      "There's no door to the east. Choose a side with a door the party has found.",
    ],
    ['exploration.door.stuck', {}, 'The door is stuck. Choose a party member to force it open.'],
    [
      'exploration.action.requires_light',
      { character: 'character-0003' },
      "It's too dark for Wren to do that. Light a torch or lantern first.",
    ],
    ['items.equip.armour_forbidden', { class: 'magic_user' }, "Magic-users can't wear armour."],
    [
      'items.equip.weapon_not_allowed',
      { class: 'magic_user', item: 'sword' },
      "Magic-users can't wield a sword.",
    ],
    [
      'items.equip.armour_not_allowed',
      { class: 'thief', item: 'chainmail' },
      "Thieves can't wear a suit of chainmail.",
    ],
    [
      'items.equip.two_handed_with_shield',
      { item: 'two_handed_sword' },
      "A two-handed sword is a two-handed weapon, so you can't wield it with a shield. Unequip the shield first.",
    ],
    [
      'items.purchase.insufficient_funds',
      { cost_gp: 1500 },
      "That costs 1,500 gp, but you don't have enough gold.",
    ],
    ['exploration.item.not_carried', { item: 'gp' }, "That character doesn't have enough gold pieces."],
    ['exploration.item.not_carried', { item: 'magic-item-0001' }, "That character doesn't have a potion."],
    [
      'magic.cast.not_memorized',
      { spell: 'sleep', reversed: 0 },
      "That caster doesn't have Sleep memorized. Casters memorize spells after a night's rest.",
    ],
    [
      'magic.cast.not_memorized',
      { spell: 'cure_light_wounds', reversed: 1 },
      "That caster doesn't have Cure Light Wounds memorized in its reversed form. Casters memorize spells after a night's rest.",
    ],
    [
      'magic.cast.out_of_range',
      { spell: 'magic_missile', distance_feet: 180, range_feet: 150 },
      'The target is 180 feet away, but Magic Missile reaches only 150 feet.',
    ],
    [
      'combat.attack.out_of_reach',
      { distance_feet: 20 },
      'The target is 20 feet away, too far for a melee attack. Close in first, or use a missile weapon or spell.',
    ],
    [
      'combat.attack.attacker_incapacitated',
      { attacker: 'character-0001', condition: 'paralysed' },
      "Brenna can't attack while paralysed.",
    ],
    [
      'battle.declaration.roster_mismatch',
      { expected: ['character-0001', 'character-0002', 'character-0003'], declared: ['character-0001'] },
      'Declare an action for Brenna, Tomas, and Wren this round. You sent declarations for Brenna.',
    ],
    [
      'creation.class.requirements_not_met',
      { class: 'elf', ability: 'int', minimum: 9, score: 5 },
      'Elves require Intelligence 9 or higher, but this character has 5.',
    ],
    [
      'creation.adjustment.below_floor',
      { ability: 'wis', score: 11, amount: 8 },
      "Wisdom is 11, so lowering it by 8 drops it below 9. Ability scores can't be lowered below 9.",
    ],
    [
      'session.command.wrong_mode',
      { command: 'move_party', mode: 'town' },
      "You can't move the party while in town.",
    ],
    [
      'session.command.wrong_mode',
      { command: 'enter_dungeon', mode: 'battle' },
      "You can't enter a dungeon during a battle.",
    ],
    [
      'session.command.quest_state',
      { quest: 'the-idol', objective: 'recover-idol', state: 'complete' },
      'That objective is already complete.',
    ],
    [
      'exploration.door.gate_refused',
      { direction: 'east', refusal: 'The door will not move.' },
      'The door will not move.',
    ],
    [
      'exploration.door.gate_refused',
      { direction: 'east' },
      "The door to the east won't open. The party doesn't have what it needs to pass yet.",
    ],
    ['items.scroll.no_such_spell', { spell: 'sleep' }, "That scroll doesn't contain Sleep."],
    [
      'town.healing.no_effect',
      { item: 'cure_disease', character: 'character-0001' },
      "Brenna doesn't need cure disease right now.",
    ],
  ] as const)('%s', (code, params, expected) => {
    expect(rej(code, params as Record<string, string | number>)).toBe(expected);
  });

  it('names an unknown member as a party member, never as an ID', () => {
    expect(rej('battle.declaration.not_in_front_rank', { character: 'character-0099' }, emptyContext())).toBe(
      "A party member isn't in the front rank, so they can't attack in melee. Close with the monsters first, or use a missile weapon or spell.",
    );
  });

  it('drops repeated sentences when it describes a list', () => {
    expect(
      describeRejections(
        [
          { code: 'combat.attack.out_of_reach', params: { distance_feet: 20 } },
          { code: 'combat.attack.out_of_reach', params: { distance_feet: 20 } },
        ],
        ctx,
      ),
    ).toEqual([
      'The target is 20 feet away, too far for a melee attack. Close in first, or use a missile weapon or spell.',
    ]);
  });
});

describe('events', () => {
  const hit = {
    event_type: 'attack_rolled',
    code: 'combat.attack.hit',
    visibility: 'player',
    attacker_id: 'character-0001',
    defender_id: 'monster-0001',
    attack_name: 'Sword',
    roll: 16,
    modifier: 1,
    total: 17,
    required: 13,
    defender_ac: 6,
    natural: null,
    back_stab: false,
  };
  const damage = {
    event_type: 'damage_dealt',
    code: 'combat.damage.dealt',
    visibility: 'player',
    target_id: 'monster-0001',
    attacker_id: 'character-0001',
    amount: 5,
    rolls: [5],
    keys: [],
    non_regenerable: false,
  };

  it('describes a hit and its damage as one line with the dice in the detail', () => {
    const [line, ...rest] = describeEvents([hit, damage], refCtx);
    expect(rest).toEqual([]);
    expect(line).toMatchObject({
      text: 'Brenna hits a goblin with a sword for 5 damage.',
      detail: 'Rolled 16 +1 = 17, needed 13 against armour class 6. Damage dice: 5.',
      category: 'damage',
      tone: 'good',
      icon: 'sword',
      actorIds: ['character-0001', 'monster-0001'],
      amount: 5,
      visibility: 'player',
    });
  });

  it('describes a hit alone, a miss, and a monster that hits a party member', () => {
    expect(describeEvent(hit, refCtx).text).toBe('Brenna hits a goblin with a sword.');
    expect(describeEvent({ ...hit, code: 'combat.attack.missed', roll: 4, total: 5 }, refCtx).text).toBe(
      'Brenna misses a goblin with a sword.',
    );
    const monsterHit = {
      ...hit,
      attacker_id: 'monster-0001',
      defender_id: 'character-0002',
      attack_name: 'claw',
    };
    const line = describeEvent(monsterHit, refCtx);
    expect(line.text).toBe('A goblin hits Tomas with its claw.');
    expect(line.tone).toBe('bad');
  });

  it('describes a monster the player cannot resolve by the one kind in the fight', () => {
    expect(
      describeEvent(
        { ...hit, attacker_id: 'monster-0009', defender_id: 'character-0002', attack_name: 'weapon' },
        ctx,
      ).text,
    ).toBe('A goblin hits Tomas.');
    const mixed = contextFromPlayerView({
      ...party,
      encounter: {
        groups: [
          ...party.encounter.groups,
          { id: 'group-0002', label: 'skeleton', label_plural: 'skeletons', count: 2 },
        ],
      },
    });
    expect(
      describeEvent(
        { ...hit, attacker_id: 'monster-0009', defender_id: 'character-0002', attack_name: 'weapon' },
        mixed,
      ).text,
    ).toBe('A monster hits Tomas.');
  });

  it('learns which monster an ID was from a defeat in the same outcome', () => {
    const defeated = {
      event_type: 'monster_defeated',
      code: 'battle.monster.defeated',
      visibility: 'player',
      monster_id: 'monster-0007',
      template_id: 'skeleton',
      outcome: 'slain',
      xp: 10,
    };
    const lines = describeEvents([{ ...hit, defender_id: 'monster-0007' }, defeated], emptyContext());
    expect(lines.map((line) => line.text)).toEqual([
      'A party member hits a skeleton with a sword.',
      'A skeleton is slain.',
    ]);
    expect(extendContextWithEvents(emptyContext(), [defeated]).monsters['monster-0007']?.label).toBe(
      'skeleton',
    );
  });

  it.each([
    [
      { event_type: 'death', code: 'combat.death.died', visibility: 'player', target_id: 'character-0003' },
      'Wren dies!',
      'danger',
      'death',
    ],
    [
      { event_type: 'death', code: 'combat.death.died', visibility: 'player', target_id: 'monster-0001' },
      'A goblin dies.',
      'good',
      'death',
    ],
    [
      {
        event_type: 'condition_gained',
        code: 'effects.condition.gained',
        visibility: 'player',
        target_id: 'character-0001',
        condition: 'asleep',
        effect_id: null,
      },
      'Brenna falls asleep.',
      'bad',
      'battle',
    ],
    [
      {
        event_type: 'saving_throw_rolled',
        code: 'combat.save.failed',
        visibility: 'player',
        target_id: 'character-0001',
        category: 'paralysis',
        roll: 4,
        modifier: 0,
        required: 14,
      },
      'Brenna fails a saving throw versus paralysis or turn to stone.',
      'bad',
      'battle',
    ],
    [
      {
        event_type: 'healing_applied',
        code: 'combat.healing.applied',
        visibility: 'player',
        target_id: 'character-0002',
        amount: 4,
        source: 'magical',
      },
      'Tomas regains 4 hit points.',
      'good',
      'healing',
    ],
    [
      {
        event_type: 'party_moved',
        code: 'exploration.party.moved',
        visibility: 'player',
        x: 2,
        y: 0,
        facing: 'east',
        narrative: null,
      },
      'The party moves east.',
      'neutral',
      'movement',
    ],
    [
      {
        event_type: 'door',
        code: 'exploration.door.forced',
        visibility: 'player',
        x: 2,
        y: 0,
        direction: 'east',
        character_id: 'character-0001',
        narrative: null,
      },
      'Brenna forces the door to the east open.',
      'good',
      'door',
    ],
    [
      {
        event_type: 'light',
        code: 'exploration.light.expired',
        visibility: 'player',
        character_id: 'character-0001',
        source: 'torch',
      },
      'The torch that Brenna carries burns out.',
      'bad',
      'light',
    ],
    [
      {
        event_type: 'encounter_started',
        code: 'encounter.started',
        visibility: 'player',
        monster_name: 'goblin',
        monster_name_plural: 'goblins',
        count: 2,
        distance_feet: 20,
        party_surprised: true,
        monsters_surprised: false,
      },
      'The party meets 2 goblins, 20 feet away. The party is surprised.',
      'danger',
      'encounter',
    ],
    [
      {
        event_type: 'stance_changed',
        code: 'encounter.stance.changed',
        visibility: 'player',
        stance: 'hostile',
      },
      'The monsters are hostile.',
      'danger',
      'encounter',
    ],
    [
      { event_type: 'monster_fled', code: 'battle.side.fled', visibility: 'player', group_id: 'group-0001' },
      'The goblins flee.',
      'good',
      'battle',
    ],
    [
      {
        event_type: 'member_moved',
        code: 'battle.member.moved',
        visibility: 'player',
        character_id: 'character-0001',
        move: 'fighting_withdrawal',
        advance_feet: -10,
        group_id: 'group-0001',
        distance_feet: 15,
      },
      'Brenna falls back to 15 feet from the goblins.',
      'neutral',
      'battle',
    ],
    [
      { event_type: 'battle_ended', code: 'battle.ended.victory', visibility: 'player' },
      'The party wins the battle!',
      'good',
      'battle',
    ],
    [
      {
        event_type: 'spell_cast',
        code: 'magic.cast.cast',
        visibility: 'player',
        caster_id: 'character-0004',
        spell_id: 'sleep',
        mode: 'hd_budget',
        reversed: false,
        target_ids: ['monster-0001', 'monster-0002', 'monster-0003'],
        manual: false,
      },
      'Ilsa casts Sleep at 3 goblins.',
      'info',
      'magic',
    ],
    [
      {
        event_type: 'undead_turned',
        code: 'magic.turning.failed',
        visibility: 'player',
        caster_id: 'character-0002',
        roll: 5,
        hd_pool: null,
        types: [],
        affected_ids: [],
      },
      'Tomas presents the holy symbol, but the turning fails.',
      'bad',
      'magic',
    ],
    [
      {
        event_type: 'item_acquired',
        code: 'exploration.item.acquired',
        visibility: 'player',
        character_id: 'character-0003',
        item_ids: ['torch', 'torch', 'rope', 'jade-idol', 'magic-item-0001'],
        coins_gp_value: 30,
        origin: 'treasure',
      },
      'Wren takes 2 torches, a 50-foot rope, a jade idol, a potion, and coins worth 30 gp.',
      'good',
      'treasure',
    ],
    [
      {
        event_type: 'item_consumed',
        code: 'exploration.item.consumed',
        visibility: 'player',
        character_id: 'character-0001',
        item_id: 'iron_spikes',
      },
      'Brenna uses up an iron spike.',
      'neutral',
      'item',
    ],
    [
      {
        event_type: 'xp_awarded',
        code: 'session.xp.awarded',
        visibility: 'player',
        character_id: 'character-0001',
        award: 2200,
        modified_award: 2310,
        level_after: 2,
      },
      'Brenna gains 2,310 experience points.',
      'good',
      'xp',
    ],
    [
      {
        event_type: 'leveled_up',
        code: 'session.level.gained',
        visibility: 'player',
        character_id: 'character-0001',
        level_before: 1,
        level_after: 2,
        hp_gained: 4,
        hp_roll: 3,
        con_applied: true,
        title: 'Warrior',
      },
      "Brenna reaches level 2 and gains 4 hit points. Brenna's title is now Warrior.",
      'good',
      'xp',
    ],
    [
      {
        event_type: 'level_drained',
        code: 'combat.drain.drained',
        visibility: 'player',
        target_id: 'character-0001',
        levels_lost: 1,
        new_level: 2,
        hp_lost: 4,
        xp_after: 1000,
        spawn_consequence: null,
      },
      'Brenna loses a level and is now level 2.',
      'danger',
      'damage',
    ],
    [
      {
        event_type: 'time_advanced',
        code: 'session.time.advanced',
        visibility: 'referee',
        n: 3,
        unit: 'turn',
        rounds_total: 3780,
      },
      'The referee moves the clock forward 3 turns, or 30 minutes.',
      'info',
      'time',
    ],
    [
      {
        event_type: 'journal_entry_added',
        code: 'session.journal.entry_added',
        visibility: 'player',
        text: 'The party found a rusted key.',
        rounds: 12240,
      },
      'Journal entry: The party found a rusted key.',
      'info',
      'journal',
    ],
    [
      {
        event_type: 'quest_completed',
        code: 'session.quest.completed',
        visibility: 'player',
        quest_id: 'the-idol',
        name: 'The Jade Idol',
        narrative: 'The idol is home.',
      },
      'Quest complete: The Jade Idol. The idol is home.',
      'good',
      'quest',
    ],
    [
      {
        event_type: 'healing_purchased',
        code: 'town.healing.purchased',
        visibility: 'player',
        character_id: 'character-0002',
        service: 'cure_light_wounds',
        cost_gp: 25,
        payers: ['character-0002', 'character-0001'],
        payments_gp: [19, 6],
      },
      'Tomas buys cure light wounds at the temple for 25 gp.',
      'info',
      'town',
    ],
    [
      {
        event_type: 'game_over',
        code: 'session.game_over',
        visibility: 'player',
        reason: 'the party has fallen',
      },
      'The party has fallen, and the game is over.',
      'danger',
      'system',
    ],
  ] as const)('describes %#', (event, text, tone, category) => {
    const line = describeEvent(event as never, refCtx);
    expect(line.text).toBe(text);
    expect(line.tone).toBe(tone);
    expect(line.category).toBe(category);
  });

  it('describes a referee-only event for a referee', () => {
    const line = describeEvent(
      {
        event_type: 'wandering_check',
        code: 'exploration.wandering.checked',
        visibility: 'referee',
        chance: 2,
        roll: 5,
        encounter: false,
      },
      refCtx,
    );
    expect(line).toMatchObject({
      text: 'No wandering monsters come.',
      detail: 'Rolled 5 on d6 against 2 in 6.',
      category: 'encounter',
      visibility: 'referee',
    });
  });

  it('describes the hidden roll of a failed lock pick, which the players never see', () => {
    const line = describeEvent(
      {
        event_type: 'detection_rolled',
        code: 'exploration.detection.rolled',
        visibility: 'referee',
        character_id: 'character-0003',
        kind: 'open_locks',
        chance: 55,
        roll: 56,
        passed: false,
      },
      refCtx,
    );
    expect(line.text).toBe('Wren tries to pick the lock and fails.');
    expect(line.detail).toBe('Rolled 56 on d100 against 55%.');
  });

  it('describes place names that the referee view supplies, and degrades without them', () => {
    const event = {
      event_type: 'location_entered',
      code: 'exploration.location.entered',
      visibility: 'player',
      location_kind: 'area',
      location_id: 'guard_room',
      level_number: 1,
      dungeon_id: 'barrow',
      narrative: null,
      via: null,
      transition_ref: null,
    };
    expect(describeEvent(event, refCtx).text).toBe('The party enters the guard room.');
    expect(describeEvent(event, refCtx).detail).toBe('Level 1 of the Barrow.');
    expect(describeEvent(event, ctx).text).toBe('The party enters the guard room.');
    const stairs = {
      ...event,
      location_kind: 'level',
      location_id: 'barrow',
      via: 'stairs_down',
      level_number: 2,
    };
    expect(describeEvent(stairs, refCtx).text).toBe('The party descends to level 2 of the Barrow.');
    const town = {
      ...event,
      location_kind: 'town',
      location_id: 'town',
      level_number: null,
      dungeon_id: null,
    };
    expect(describeEvent(town, ctx).text).toBe('The party arrives in Threshold.');
  });

  it('collapses a run of empty wandering checks into one line', () => {
    const check = {
      event_type: 'wandering_check',
      code: 'exploration.wandering.checked',
      visibility: 'referee',
      chance: 1,
      roll: 4,
      encounter: false,
    };
    const lines = describeEvents([check, check, check, check], ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe('No wandering monsters come in 4 checks.');
  });

  it('drops the dead condition that a death event repeats', () => {
    const lines = describeEvents(
      [
        {
          event_type: 'condition_gained',
          code: 'effects.condition.gained',
          visibility: 'player',
          target_id: 'character-0001',
          condition: 'dead',
          effect_id: null,
        },
        {
          event_type: 'hit_points_reported',
          code: 'combat.state.hit_points',
          visibility: 'referee',
          target_id: 'character-0001',
          current_hp: 0,
          max_hp: 4,
        },
        { event_type: 'death', code: 'combat.death.died', visibility: 'player', target_id: 'character-0001' },
      ],
      ctx,
    );
    expect(lines.map((line) => line.text)).toEqual(['Brenna has 0 of 4 hit points.', 'Brenna dies!']);
  });

  it('names the potion before and after it is identified', () => {
    const used = {
      event_type: 'item_used',
      code: 'items.potion.drunk',
      visibility: 'player',
      character_id: 'character-0003',
      instance_id: 'magic-item-0001',
      manual: [],
      target_id: null,
    };
    const identified = {
      event_type: 'item_identified',
      code: 'items.item.identified',
      visibility: 'player',
      instance_id: 'magic-item-0001',
      template_id: 'potion_of_healing',
    };
    const lines = describeEvents([identified, used], ctx);
    expect(lines.map((line) => line.text)).toEqual([
      'The potion turns out to be a potion of healing.',
      'Wren drinks a potion of healing.',
    ]);
  });
});

describe('humanizeMessage', () => {
  it.each([
    ["character-0001 closes to 5' from group-0001.", "Brenna closes to 5' from the goblins."],
    [
      'monster-0001 hits character-0002 with claw: rolled 19+0 = 19, needing 12.',
      'A goblin hits Tomas with claw: rolled 19+0 = 19, needing 12.',
    ],
    ['monster-0007 (skeleton) is slain.', 'A skeleton is slain.'],
    ['character-0001 uses up iron_spikes.', 'Brenna uses up iron spike.'],
    [
      'town-cleric casts cure_light_wounds [heal] at character-0001.',
      'The temple cleric casts Cure Light Wounds [heal] at Brenna.',
    ],
    [
      'character-0001 fumbles with the tinder box \u2014 no flame.',
      'Brenna fumbles with the tinder box, no flame.',
    ],
    ['The party enters dungeon barrow (level 1).', 'The party enters the Barrow, level 1.'],
    ['The party enters area guard_room (level 1).', 'The party enters the guard room.'],
    [
      'A trap springs (hollow:1:pit_room) on character-0003!',
      'A trap springs (the trap in the pit room) on Wren!',
    ],
    [
      'character-0003 acquires magic-item-0001, valuable-0001 and 30 gp in coin.',
      'Wren acquires a potion, a ruby and 30 gp in coin.',
    ],
    ['npc-0001 hits character-0001 with Sword.', 'Aldric hits Brenna with Sword.'],
    ['Effect effect-0001 (haste) attached to character-0001.', 'The haste effect attached to Brenna.'],
  ])('%s', (message, expected) => {
    expect(humanizeMessage(message, refCtx)).toBe(expected);
  });

  it('never prints an ID when the context knows nothing', () => {
    const text = humanizeMessage(
      'monster-0003 misses character-0009 with group-0004 and magic-item-0002.',
      emptyContext(),
    );
    expect(text).toBe('A monster misses a party member with the monsters and a magic item.');
  });
});

describe('contexts', () => {
  it('reads members, groups, magic item displays, valuables, and the town from a player view', () => {
    expect(ctx.members['character-0003']).toEqual({ name: 'Wren', classId: 'thief', level: 1 });
    expect(ctx.groups['group-0001']).toEqual({ label: 'goblin', labelPlural: 'goblins', count: 3, size: 3 });
    expect(ctx.items['magic-item-0001']).toBe('potion');
    expect(ctx.items['valuable-0001']).toBe('ruby');
    expect(ctx.townName).toBe('Threshold');
  });

  it('keeps names from earlier views when a new view adds more', () => {
    const next = contextFromPlayerView(
      { party: [{ id: 'character-0005', name: 'Corwin', class_id: 'fighter' }] },
      ctx,
    );
    expect(Object.keys(next.members)).toHaveLength(5);
    expect(next.groups['group-0001']).toBeDefined();
  });

  it('extends a context with catalog lookups for IDs the built-in catalog lacks', () => {
    const extended = extendContextWithCatalog(ctx, {
      spells: [{ id: 'moon_bolt', name: 'Moon Bolt' }],
      equipment: [{ id: 'moon_blade', name: 'Moon Blade' }],
    });
    expect(
      describeEvent(
        {
          event_type: 'spell_declared',
          code: 'battle.spell.declared',
          visibility: 'player',
          caster_id: 'character-0004',
          spell_id: 'moon_bolt',
          reversed: false,
        },
        extended,
      ).text,
    ).toBe('Ilsa begins casting Moon Bolt.');
    expect(
      describeEvent(
        {
          event_type: 'item_consumed',
          code: 'exploration.item.consumed',
          visibility: 'player',
          character_id: 'character-0001',
          item_id: 'moon_blade',
        },
        extended,
      ).text,
    ).toBe('Brenna uses up a moon blade.');
  });
});

describe('commands', () => {
  it('gives a label, a button, and a description', () => {
    expect(commandInfo('open_door')).toEqual({
      label: 'Open a door',
      button: 'Open',
      phrase: 'open a door',
      description: 'Open an unlocked, unstuck door beside the party.',
      kind: 'play',
    });
    expect(commandInfo('award_xp')).toMatchObject({
      label: 'Award experience',
      button: 'Award XP',
      kind: 'referee',
    });
    expect(commandInfo('resolve_battle_round').button).toBe('Resolve');
  });

  it('gives a label and help text for a field, and labels for its options', () => {
    expect(commandFieldText('force_door', 'character_id')).toEqual({
      label: 'Who forces the door',
      help: 'The member who tries. Strength sets the chance, so send the strongest member.',
    });
    expect(commandFieldText('rest', 'kind').label).toBe('How long');
    expect(commandFieldText('open_door', 'direction').label).toBe('Door');
    expect(commandFieldOptionLabel('rest', 'kind', 'night')).toBe('A night');
    expect(commandFieldOptionLabel('search', 'kind', 'secret_doors')).toBe('Secret doors');
    expect(commandFieldOptionLabel('evade', 'drop', 'treasure')).toBe('Treasure');
    expect(commandFieldOptionLabel('purchase_healing', 'service', 'raise_dead')).toBe('Raise dead');
  });

  it('reads an unknown command as its own words', () => {
    expect(commandInfo('juggle_torches')).toMatchObject({
      label: 'Juggle torches',
      button: 'Juggle torches',
      phrase: 'juggle torches',
    });
  });
});
