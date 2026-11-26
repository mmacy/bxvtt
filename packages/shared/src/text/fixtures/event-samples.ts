/**
 * Minimal event bodies for each bxapi event type, used by the tests to build an event for every code.
 *
 * Each entry has the fields of the event class with plausible values. `codes` lists per-code overrides for the
 * fields that change what an event means, such as `condition` or `reason`.
 */

export interface EventSample {
  base: Record<string, unknown>;
  codes?: Record<string, Record<string, unknown>>;
}

const A = 'character-0001';
const B = 'character-0002';

export const EVENT_SAMPLES: Record<string, EventSample> = {
  adventure_completed: { base: { quest_id: 'the-idol', name: 'The Jade Idol', narrative: null } },
  adventure_xp_award: {
    base: {
      monster_xp: 100,
      treasure_xp: 250,
      share: 87,
      survivors: [A, B, 'character-0003', 'character-0004'],
    },
  },
  attack_rolled: {
    base: {
      attacker_id: A,
      defender_id: 'monster-0001',
      attack_name: 'Sword',
      roll: 16,
      modifier: 1,
      total: 17,
      required: 13,
      defender_ac: 6,
      natural: null,
      back_stab: false,
    },
    codes: { 'combat.attack.auto_hit': { roll: null, total: null, required: null, defender_ac: null } },
  },
  battle_ended: { base: {} },
  battle_round: { base: { round: 2 } },
  battle_started: { base: {} },
  leveled_up: {
    base: {
      character_id: A,
      level_before: 1,
      level_after: 2,
      hp_gained: 4,
      hp_roll: 3,
      con_applied: true,
      title: 'Warrior',
    },
  },
  condition_gained: { base: { target_id: A, condition: 'paralysed', effect_id: 'effect-0001' } },
  condition_removed: { base: { target_id: A, condition: 'paralysed', effect_id: 'effect-0001' } },
  curse_revealed: {
    base: { character_id: A, instance_id: 'magic-item-0005', template_id: 'sword_minus_1_cursed' },
  },
  damage_absorbed: { base: { target_id: 'monster-0001', attacker_id: A, keys: ['silver'] } },
  damage_dealt: {
    base: {
      target_id: 'monster-0001',
      attacker_id: A,
      amount: 5,
      rolls: [5],
      keys: [],
      non_regenerable: false,
    },
  },
  death: { base: { target_id: A } },
  declaration_fizzled: {
    base: {
      actor_id: A,
      item_id: null,
      target_id: null,
      group_id: null,
      reason: 'battle.declaration.no_target',
    },
    codes: {
      'battle.give.fizzled': {
        item_id: 'rope',
        target_id: B,
        reason: 'session.command.member_incapacitated',
      },
      'battle.melee.fizzled': { group_id: 'group-0001' },
      'magic.device.fizzled': { item_id: 'magic-item-0006', reason: 'battle.declaration.unknown_group' },
      'magic.potion.fizzled': {
        item_id: 'magic-item-0001',
        target_id: B,
        reason: 'items.use.target_cannot_drink',
      },
      'magic.turning.fizzled': { reason: 'battle.declaration.no_target' },
    },
  },
  detection_rolled: { base: { character_id: B, kind: 'listening', chance: 2, roll: 3, passed: false } },
  dice_rolled: { base: { expression: '2d6+1', total: 10, rolls: [4, 5] } },
  door: {
    base: { x: 1, y: 0, direction: 'east', character_id: null, narrative: null },
    codes: {
      'exploration.door.forced': { character_id: A },
      'exploration.door.stuck': { character_id: A },
      'exploration.door.unlocked': { character_id: B },
    },
  },
  effect_attached: {
    base: { effect_id: 'effect-0001', kind: 'sleep', target_ref: 'monster-0001', expires_round: 120 },
  },
  effect_expired: {
    base: { effect_id: 'effect-0001', kind: 'sleep', target_ref: 'monster-0001', round: 120 },
  },
  effect_released: { base: { effect_id: 'effect-0001', kind: 'light', target_ref: A } },
  effect_ticked: {
    base: { effect_id: 'effect-0001', kind: 'regeneration', target_ref: 'monster-0001', round: 12 },
  },
  encounter_ended: { base: { outcome: 'victory' } },
  encounter_group_joined: {
    base: {
      group_id: 'group-0002',
      label: 'skeleton',
      label_plural: 'skeletons',
      count: 2,
      distance_feet: 90,
    },
  },
  encounter_started: {
    base: {
      monster_name: 'goblin',
      monster_name_plural: 'goblins',
      count: 3,
      distance_feet: 20,
      party_surprised: false,
      monsters_surprised: false,
      group_labels: ['goblin'],
      group_labels_plural: ['goblins'],
      group_counts: [3],
    },
  },
  equipment_destroyed: { base: { target_id: A, item_names: ['Torches (6)', 'Sword'], saved_items: [] } },
  evasion: { base: {} },
  exhaustion: { base: {} },
  fatigue: { base: {} },
  flag_set: { base: { key: 'lever', value: 'pulled' } },
  game_over: { base: { reason: 'the party has fallen' } },
  group_moved: { base: { group_id: 'group-0001', distance_feet: 5 } },
  healing_applied: { base: { target_id: A, amount: 4, source: 'magical' } },
  hide_attempted: { base: { character_id: A } },
  healing_purchased: {
    base: {
      character_id: B,
      service: 'cure_light_wounds',
      cost_gp: 25,
      payers: [B, A],
      payments_gp: [19, 6],
    },
  },
  hit_points_reported: { base: { target_id: A, current_hp: 3, max_hp: 7 } },
  hoard_generated: {
    base: {
      cache_ref: 'cache-0001',
      treasure_types: ['B'],
      coins_gp_value: 340,
      coins: { pp: 0, gp: 300, ep: 0, sp: 400, cp: 0 },
      valuable_ids: [],
      magic_item_ids: ['magic-item-0001'],
    },
  },
  initiative_rolled: {
    base: {
      mode: 'side',
      entries: [
        { key: 'party', rolls: [4], modifier: 0, total: 4 },
        { key: 'monsters', rolls: [2], modifier: 0, total: 2 },
      ],
      order: [A, B, 'group-0001'],
    },
  },
  item_acquired: {
    base: {
      character_id: A,
      item_ids: ['torch', 'torch', 'rope'],
      coins_gp_value: 30,
      coins: { pp: 0, gp: 30, ep: 0, sp: 4, cp: 0 },
      origin: 'treasure',
    },
  },
  item_consumed: { base: { character_id: A, item_id: 'iron_spikes' } },
  item_identified: {
    base: {
      instance_id: 'magic-item-0001',
      template_id: 'potion_of_healing',
      display_name: 'potion of healing',
      display_name_plural: 'potions of healing',
    },
  },
  item_used: { base: { character_id: A, instance_id: 'magic-item-0001', manual: [], target_id: null } },
  items_dropped: {
    base: { character_id: A, item_ids: ['rope'], coins_gp_value: 10, coins: { gp: 10, sp: 0, cp: 0 } },
  },
  items_given: {
    base: { character_id: A, recipient_id: B, item_ids: ['rope'], coins_gp_value: 5, coins: { gp: 5 } },
  },
  items_left_behind: { base: { item_ids: ['chainmail'], coins_gp_value: 200, coins: { gp: 200 } } },
  items_removed: { base: { character_id: A, item_ids: ['rope'], coins_gp_value: 0, coins: { cp: 0 } } },
  journal_entry_added: { base: { text: 'The party found a rusted key.', rounds: 1200 } },
  level_drained: {
    base: { target_id: A, levels_lost: 1, new_level: 1, hp_lost: 4, xp_after: 1000, spawn_consequence: null },
  },
  light: { base: { character_id: A, source: 'torch' } },
  listened: { base: { character_id: B, direction: 'east' } },
  location_entered: {
    base: {
      location_kind: 'area',
      location_id: 'guard_room',
      level_number: 1,
      dungeon_id: 'barrow',
      narrative: null,
      via: null,
      transition_ref: null,
    },
  },
  loot_dropped: { base: { item_ids: ['jade-idol'], coins_gp_value: 0, coins: { cp: 39 } } },
  magic_dispelled: { base: { caster_id: B, released_effect_ids: ['effect-0001'], surviving_effect_ids: [] } },
  member_added: { base: { character_id: 'character-0005', name: 'Corwin', class_id: 'fighter', level: 1 } },
  member_moved: {
    base: { character_id: A, move: 'close', advance_feet: 15, group_id: 'group-0001', distance_feet: 5 },
  },
  member_removed: { base: { character_id: 'character-0005', name: 'Corwin', given_to: A } },
  member_withdrew: { base: { character_id: A, replacement_id: B } },
  monster_defeated: { base: { monster_id: 'monster-0001', template_id: 'goblin', outcome: 'slain', xp: 5 } },
  monster_escaped: { base: { group_id: 'group-0001' } },
  monster_fled: { base: { group_id: 'group-0001' } },
  monster_revived: { base: { target_id: 'monster-0001' } },
  monsters_left_behind: { base: { group_id: 'group-0002', source_group_id: 'group-0001', count: 2 } },
  monsters_spawned: {
    base: {
      template_id: 'centipede_giant',
      monster_ids: ['monster-0001', 'monster-0002'],
      display_name: 'giant centipede',
      display_name_plural: 'giant centipedes',
    },
  },
  morale_checked: {
    base: { subject: 'group-0001', score: 7, roll: 5, modifier: 0, held: true },
    codes: {
      'combat.morale.broke': { held: false, roll: 11 },
      'combat.morale.exempt': { score: 12, roll: null },
    },
  },
  note_recorded: { base: { text: 'Goblins are bluffing.' } },
  npc_party_spawned: {
    base: {
      party_kind: 'basic',
      npc_ids: ['npc-0001', 'npc-0002'],
      class_ids: ['fighter', 'thief'],
      levels: [2, 1],
      alignment: 'chaotic',
    },
  },
  objective_completed: {
    base: {
      quest_id: 'the-idol',
      quest_name: 'The Jade Idol',
      objective_id: 'recover-idol',
      name: 'Recover the idol',
      narrative: null,
    },
  },
  objective_revealed: {
    base: {
      quest_id: 'the-idol',
      quest_name: 'The Jade Idol',
      objective_id: 'recover-idol',
      name: 'Recover the idol',
      narrative: null,
    },
  },
  party_moved: { base: { x: 2, y: 0, facing: 'east', narrative: null } },
  party_reordered: { base: { order: [B, A] } },
  provisions: { base: { character_id: A, kind: 'food' } },
  pursuit: { base: { round: 2, gap_feet: 30 } },
  quest_activated: { base: { quest_id: 'the-idol', name: 'The Jade Idol', narrative: null } },
  quest_completed: { base: { quest_id: 'the-idol', name: 'The Jade Idol', narrative: null } },
  reaction_rolled: { base: { roll: 5, modifier: 1, total: 6, result: 'uncertain' } },
  rested: { base: { kind: 'night' } },
  saving_throw_rolled: {
    base: { target_id: A, category: 'paralysis', roll: 12, modifier: 0, required: 14 },
    codes: { 'combat.save.auto': { roll: null, required: null } },
  },
  search_completed: {
    base: { character_id: A, kind: 'secret_doors', found: [] },
    codes: { 'exploration.search.found': { found: ['secret_door:north'] } },
  },
  spell_book_updated: { base: { caster_id: B, spell_id: 'magic_missile' } },
  spell_cast: {
    base: {
      caster_id: B,
      spell_id: 'sleep',
      mode: 'hd_budget',
      reversed: false,
      target_ids: ['monster-0001'],
      manual: false,
    },
  },
  spell_declared: { base: { caster_id: B, spell_id: 'sleep', reversed: false } },
  spell_disrupted: {
    base: { caster_id: B, spell_id: 'sleep', reversed: false, reason: null },
    codes: { 'magic.cast.fizzled': { reason: 'magic.cast.silenced_area' } },
  },
  spell_forgotten: { base: { caster_id: B, spell_id: 'sleep', reversed: false } },
  spells_memorized: { base: { caster_id: B, prepared: [{ spell_id: 'sleep', reversed: false }] } },
  stance_changed: { base: { stance: 'hostile' } },
  surprise_rolled: { base: { side: 'party', threshold: 2, roll: 1, surprised: true } },
  targets_selected: { base: { mode: 'hd_budget', target_ids: ['monster-0001'] } },
  time_advanced: { base: { n: 3, unit: 'turn', rounds_total: 3780 } },
  trap: {
    base: { trap_ref: 'hollow:1:pit_room', character_id: A, direction: null },
    codes: { 'exploration.trap.found': { direction: 'east' } },
  },
  treasure_sold: { base: { character_id: A, instance_ids: ['valuable-0001'], gp_value: 100 } },
  trigger_fired: { base: { trigger_id: 'alarm', narrative: null } },
  undead_turned: {
    base: {
      caster_id: B,
      roll: 8,
      hd_pool: 6,
      types: [{ template_id: 'skeleton', column: '1', outcome: 'turn', threshold: 7 }],
      affected_ids: ['monster-0001'],
    },
  },
  wandering_check: { base: { chance: 1, roll: 4, encounter: false }, codes: {} },
  xp_awarded: {
    base: {
      character_id: A,
      award: 100,
      modified_award: 105,
      level_after: 1,
      gained: 105,
      clamped: false,
    },
  },
};
