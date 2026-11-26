/**
 * Tests for text that feature engineers reported from real play. Each test reproduces the reported output with
 * the inputs that produced it, and states the text the layer writes now.
 */
import { describe, expect, it } from 'vitest';
import codes from './data/codes.json' with { type: 'json' };
import outcomes from './fixtures/outcomes.json' with { type: 'json' };
import bell from '../../../../adventures/the-drowned-bell.json' with { type: 'json' };
import bridge from '../../../../adventures/the-toll-bridge.json' with { type: 'json' };
import {
  contextFromPlayerView,
  describeEvent,
  describeEvents,
  equipmentNoun,
  describeGameEntry,
  emptyContext,
  extendContextWithCatalog,
  extendContextWithEntryNames,
  flagName,
  flagValueText,
  nameInSentence,
  placeInSentence,
  classInSentence,
  extendContextWithNames,
  extendContextWithReferee,
  humanizeMessage,
  itemLabel,
  itemName,
  itemNounFromName,
  itemPhrase,
  resolveItemNoun,
  stripArticle,
  timeUnitNoun,
  weaponQualityDescription,
  weaponQualityLabel,
  WEAPON_QUALITY_VALUES,
  TIME_UNIT_VALUES,
  type TextContext,
} from './index';

const view = {
  party: [
    { id: 'character-0001', name: 'Brenna', class_id: 'fighter', level: 1 },
    { id: 'character-0002', name: 'Mira', class_id: 'cleric', level: 1 },
    { id: 'character-0003', name: 'Wren', class_id: 'thief', level: 1 },
  ],
  town_name: 'Hollin Ferry',
};
const base = contextFromPlayerView(view);

/**
 * Item names as a feed entry stored them before osrlib 2.8, from the scene the server sent then: catalog lot names,
 * masked names with their articles, and authored names. Such stored entries must still read well.
 */
const storedNames: Record<string, string> = {
  torch: 'Torches (6)',
  holy_water: 'Holy water (vial)',
  chainmail: 'Chainmail',
  leather: 'Leather',
  oil_flask: 'Oil (1 flask)',
  iron_spikes: 'Iron spikes (12)',
  hand_of_saint_corvane: 'Hand of Saint Corvane',
  priors_iron_key: "Prior's iron key",
  tongue_of_mercy: 'Tongue of the bell Mercy',
  'magic-item-0001': 'a potion',
  'magic-item-0002': 'Potion of Healing',
  'valuable-0001': 'The Jade Idol',
  'valuable-0002': 'Silver torc',
};

/** The client's old workaround: it copied the stored names into `ctx.items` with the article stripped. */
function copiedByHand(ctx: TextContext): TextContext {
  const items = { ...ctx.items };
  for (const [id, name] of Object.entries(storedNames)) items[id] = stripArticle(name);
  return { ...ctx, items };
}

const acquired = (itemIds: string[], origin: string, characterId = 'character-0003') => ({
  event_type: 'item_acquired',
  code: 'exploration.item.acquired',
  visibility: 'player',
  character_id: characterId,
  item_ids: itemIds,
  coins_gp_value: 0,
  origin,
});

describe('item names (reported)', () => {
  const contexts: [string, TextContext][] = [
    ['stored names copied into ctx.items', copiedByHand(base)],
    ['extendContextWithNames', extendContextWithNames(base, storedNames)],
  ];

  describe.each(contexts)('with %s', (_label, ctx) => {
    it.each([
      // Reported: "Wren buys a Torches (6)".
      [['torch'], 'Wren buys 6 torches.'],
      // Reported: "2 Holy water (vial)s".
      [['holy_water', 'holy_water'], 'Wren buys 2 vials of holy water.'],
      // Reported: "a Chainmail and 2 Torches (6)s".
      [['chainmail', 'torch', 'torch'], 'Wren buys a suit of chainmail and 12 torches.'],
      // Reported: "a Leather".
      [['leather'], 'Wren buys a suit of leather armour.'],
      // Reported: "a Oil (1 flask)".
      [['oil_flask'], 'Wren buys a flask of oil.'],
      [['iron_spikes'], 'Wren buys 12 iron spikes.'],
    ])('describes a purchase of %j by lots', (itemIds, text) => {
      expect(describeEvent(acquired(itemIds, 'purchase'), ctx).text).toBe(text);
    });

    it('counts units, not lots, outside a purchase', () => {
      // Reported: "Brenna loses a Torches (6)".
      expect(
        describeEvent(
          {
            event_type: 'items_removed',
            code: 'session.items.removed',
            visibility: 'player',
            character_id: 'character-0001',
            item_ids: ['torch'],
            coins_gp_value: 0,
          },
          ctx,
        ).text,
      ).toBe('Brenna loses a torch.');
      expect(describeEvent(acquired(['torch', 'torch', 'oil_flask'], 'treasure'), ctx).text).toBe(
        'Wren takes 2 torches and a flask of oil.',
      );
      expect(
        describeEvent(
          {
            event_type: 'item_consumed',
            code: 'exploration.item.consumed',
            visibility: 'player',
            character_id: 'character-0001',
            item_id: 'iron_spikes',
          },
          ctx,
        ).text,
      ).toBe('Brenna uses up an iron spike.');
    });

    it('keeps the capitals of an adventure proper name and lowers a sentence-case name', () => {
      // Reported: "a hand of saint corvane".
      expect(describeEvent(acquired(['hand_of_saint_corvane'], 'treasure'), ctx).text).toBe(
        'Wren takes the Hand of Saint Corvane.',
      );
      expect(itemName('priors_iron_key', ctx)).toBe("a prior's iron key");
      expect(itemName('tongue_of_mercy', ctx)).toBe('a tongue of the bell Mercy');
      expect(itemName('valuable-0001', ctx)).toBe('the Jade Idol');
      expect(itemName('valuable-0002', ctx)).toBe('a silver torc');
    });

    it('keeps the masked name of an unidentified magic item and lowers a catalog name', () => {
      expect(itemName('magic-item-0001', ctx)).toBe('a potion');
      expect(itemName('magic-item-0002', ctx)).toBe('a potion of healing');
    });
  });

  it('keeps adventure item names from the referee view in their own capitals', () => {
    const ctx = extendContextWithReferee(base, {
      adventure: {
        items: [
          { id: 'hand_of_saint_corvane', name: 'Hand of Saint Corvane' },
          { id: 'priors_iron_key', name: "Prior's iron key" },
        ],
      },
    });
    expect(itemName('hand_of_saint_corvane', ctx)).toBe('the Hand of Saint Corvane');
    expect(itemName('priors_iron_key', ctx)).toBe("a prior's iron key");
  });

  it('makes good nouns from catalog listings whatever names the caller passes', () => {
    const ctx = extendContextWithCatalog(base, {
      equipment: [
        { id: 'torch', name: 'Torches (6)' },
        { id: 'leather', name: 'Leather' },
        { id: 'candles', name: 'Candles (10)' },
        { id: 'lamp_oil', name: 'Lamp oil (2 flasks)' },
        { id: 'ink', name: 'Ink (vial)' },
      ],
      magicItems: [{ id: 'ring_of_fire_resistance', name: 'Ring of Fire Resistance' }],
    });
    expect(itemName('torch', ctx)).toBe('a torch');
    expect(itemName('leather', ctx)).toBe('a suit of leather armour');
    expect(itemName('candles', ctx)).toBe('a candle');
    expect(itemName('lamp_oil', ctx)).toBe('a flask of lamp oil');
    expect(itemName('ink', ctx)).toBe('a vial of ink');
    expect(itemName('ring_of_fire_resistance', ctx)).toBe('a ring of fire resistance');
  });

  it('gives the client one noun for an inventory entry', () => {
    // The combat and sheet models named items with `equipmentNoun(id)?.one ?? itemName(id, ctx).toLowerCase()`.
    const ctx = extendContextWithNames(base, storedNames);
    expect(resolveItemNoun('torch', ctx)).toEqual(equipmentNoun('torch'));
    expect(itemPhrase(resolveItemNoun('torch', ctx), 6)).toBe('6 torches');
    expect(itemPhrase(resolveItemNoun('holy_water', ctx))).toBe('a vial of holy water');
    expect(itemPhrase(resolveItemNoun('moon_blade', ctx, { name: 'Moon blade' }))).toBe('a moon blade');
    expect(itemPhrase(resolveItemNoun('hand_of_saint_corvane', ctx))).toBe('the Hand of Saint Corvane');
    expect(itemPhrase(resolveItemNoun('thieves_tools', ctx))).toBe('a set of thieves’ tools');
    expect(itemPhrase(resolveItemNoun('thieves_tools', ctx), 2)).toBe('2 sets of thieves’ tools');
    expect(itemLabel(resolveItemNoun('chainmail', ctx))).toBe('Chainmail');
    expect(itemLabel(resolveItemNoun('leather', ctx))).toBe('Leather armour');
    expect(itemLabel(resolveItemNoun('plate_mail', ctx))).toBe('Plate mail');
    expect(itemLabel(resolveItemNoun('shield', ctx))).toBe('Shield');
    expect(itemLabel(resolveItemNoun('mace', ctx))).toBe('Mace');
    expect(itemLabel(resolveItemNoun('backpack', ctx))).toBe('Backpack');
    expect(itemLabel(resolveItemNoun('tinder_box', ctx))).toBe('Tinder box');
    expect(itemLabel(resolveItemNoun('waterskin', ctx))).toBe('Waterskin');
    expect(itemLabel(resolveItemNoun('torch', ctx), 6)).toBe('6 torches');
    expect(itemLabel(resolveItemNoun('rations_standard', ctx), 7)).toBe('7 standard rations');
    expect(itemLabel(resolveItemNoun('hand_of_saint_corvane', ctx))).toBe('Hand of Saint Corvane');
  });

  it.each([
    ['Torches (6)', 'torch', 'torches'],
    ['Oil (1 flask)', 'flask of oil', 'flasks of oil'],
    ['Holy water (vial)', 'vial of holy water', 'vials of holy water'],
    ['Leather', 'suit of leather armour', 'suits of leather armour'],
    ['Arrows (quiver of 20)', 'arrow', 'arrows'],
    ['Sack (large)', 'large sack', 'large sacks'],
    ['Wine (2 pints)', 'pint of wine', 'pints of wine'],
    ['Candles (10)', 'candle', 'candles'],
    ['Sword +1', 'sword +1', 'swords +1'],
    ['an amulet', 'amulet', 'amulets'],
    ['a sword with a faint aura', 'sword with a faint aura', 'swords with a faint aura'],
  ])('reads %s as %s and %s', (name, one, many) => {
    expect(itemNounFromName(name)).toMatchObject({ one, many });
    expect(itemNounFromName(name).proper).toBeUndefined();
  });

  it('chooses an for a vowel sound', () => {
    expect(itemPhrase(itemNounFromName('Iron spikes (12)'))).toBe('an iron spike');
    expect(itemPhrase(itemNounFromName('Oil (1 flask)'))).toBe('a flask of oil');
    expect(itemPhrase(itemNounFromName('Amber idol'))).toBe('an amber idol');
  });
});

describe('coordinates (reported)', () => {
  it('narrates a step by direction and keeps the cell for a referee', () => {
    // Reported: "The party moves to (14, 17), facing north."
    const line = describeEvent(
      {
        event_type: 'party_moved',
        code: 'exploration.party.moved',
        visibility: 'player',
        x: 14,
        y: 17,
        facing: 'north',
        narrative: null,
      },
      base,
    );
    expect(line.text).toBe('The party moves north.');
    expect(line.detail).toBeUndefined();
    expect(line.refereeDetail).toBe('Cell (14, 17).');
  });

  it('names a door by its side and keeps the cell for a referee', () => {
    // Reported detail: "Door cell (14, 18), side north."
    const line = describeEvent(
      {
        event_type: 'door',
        code: 'exploration.door.opened',
        visibility: 'player',
        x: 14,
        y: 18,
        direction: 'north',
        character_id: null,
        narrative: null,
      },
      base,
    );
    expect(line.text).toBe('The door to the north opens.');
    expect(line.detail).toBeUndefined();
    expect(line.refereeDetail).toBe('The door is on the north side of cell (14, 18).');
  });

  it('takes the coordinates out of bxapi messages', () => {
    expect(humanizeMessage('The party moves to (14, 22), facing north.', base)).toBe(
      'The party moves north.',
    );
    expect(humanizeMessage('The door north of (14, 18) opens.', base)).toBe('The north door opens.');
    expect(humanizeMessage('character-0001 forces the door east of (3, 4) open.', base)).toBe(
      'Brenna forces the east door open.',
    );
  });
});

describe('describeEvents with only (reported)', () => {
  it('matches each message to its own event after filtering', () => {
    const unknown = (visibility: string) => ({ event_type: 'future_event', code: 'future.code', visibility });
    const lines = describeEvents([unknown('player'), unknown('referee'), unknown('player')], base, {
      only: 'player',
      messages: ['character-0001 waves.', 'The referee smiles.', 'character-0003 bows.'],
    });
    expect(lines.map((line) => line.text)).toEqual(['Brenna waves.', 'Wren bows.']);
  });
});

describe('repeated lines (reported)', () => {
  const report = {
    event_type: 'hit_points_reported',
    code: 'combat.state.hit_points',
    visibility: 'referee',
    target_id: 'character-0002',
    current_hp: 0,
    max_hp: 3,
  };
  const events = [
    {
      event_type: 'damage_dealt',
      code: 'combat.damage.dealt',
      visibility: 'player',
      target_id: 'character-0002',
      attacker_id: 'monster-0001',
      amount: 4,
      rolls: [4],
      keys: [],
      non_regenerable: false,
    },
    report,
    {
      event_type: 'condition_gained',
      code: 'effects.condition.gained',
      visibility: 'player',
      target_id: 'character-0002',
      condition: 'dead',
      effect_id: null,
    },
    { event_type: 'death', code: 'combat.death.died', visibility: 'player', target_id: 'character-0002' },
    report,
  ];

  it('says the hit points once around a death', () => {
    // Reported: "Mira has 0 of 3 hit points" twice.
    const texts = describeEvents(events, base).map((line) => line.text);
    expect(texts.filter((text) => text === 'Mira has 0 of 3 hit points.')).toHaveLength(1);
    expect(texts).toContain('Mira dies!');
  });

  it('keeps both reports when dropRedundant is off, and a new report after healing', () => {
    const texts = describeEvents(events, base, { dropRedundant: false }).map((line) => line.text);
    expect(texts.filter((text) => text === 'Mira has 0 of 3 hit points.')).toHaveLength(2);
    const healed = describeEvents(
      [
        report,
        {
          event_type: 'healing_applied',
          code: 'combat.healing.applied',
          visibility: 'player',
          target_id: 'character-0002',
          amount: 3,
          source: 'spell',
        },
        report,
      ],
      base,
    ).map((line) => line.text);
    expect(healed.filter((text) => text === 'Mira has 0 of 3 hit points.')).toHaveLength(2);
  });
});

describe('labels (reported missing)', () => {
  it('labels and describes every osrlib weapon quality', () => {
    expect([...WEAPON_QUALITY_VALUES].sort()).toEqual([...codes.enums.weapon_qualities].sort());
    for (const quality of codes.enums.weapon_qualities) {
      expect(weaponQualityLabel(quality)).toMatch(/^[A-Z][a-z]/);
      expect(weaponQualityDescription(quality)).toMatch(/^[A-Z].*\.$/);
    }
    expect(weaponQualityLabel('two_handed')).toBe('Two-handed');
  });

  it('gives a noun for every osrlib time unit', () => {
    expect([...TIME_UNIT_VALUES].sort()).toEqual([...codes.enums.time_units].sort());
    expect(timeUnitNoun('turn')).toBe('turn');
    expect(timeUnitNoun('turn', 2)).toBe('turns');
    expect(timeUnitNoun('round', 1)).toBe('round');
    expect(timeUnitNoun('day', 3)).toBe('days');
  });

  it('describes a fired trigger by what set it off, never by a quoted ID', () => {
    const fired = {
      event_type: 'trigger_fired',
      code: 'session.trigger.fired',
      visibility: 'referee',
      trigger_id: 'drain_folk_talk',
      narrative: null,
    };
    // Reported: `The adventure trigger "drain_folk_talk" fires.`
    expect(describeEvent(fired, base).text).toBe('The drain folk talk trigger fires.');
    const ctx = extendContextWithReferee(base, {
      adventure: {
        town: { name: 'Hollin Ferry' },
        dungeons: [
          {
            id: 'priory',
            name: "The priory on Corvane's Holm",
            levels: [{ number: 1, areas: [{ id: 'drain_warren', name: 'Drain warren' }] }],
          },
        ],
        items: [{ id: 'hand_of_saint_corvane', name: 'Hand of Saint Corvane' }],
        triggers: [
          {
            id: 'drain_folk_talk',
            when: {
              pattern_type: 'area_entered',
              dungeon_id: 'priory',
              level_number: 1,
              area_id: 'drain_warren',
            },
          },
          { id: 'landing', when: { pattern_type: 'dungeon_entered', dungeon_id: 'priory' } },
          { id: 'relic', when: { pattern_type: 'item_acquired', item_id: 'hand_of_saint_corvane' } },
          { id: 'home', when: { pattern_type: 'town_entered' } },
          { id: 'lever', when: { pattern_type: 'flag_set', key: 'crypt.lever' } },
        ],
      },
    });
    const text = (triggerId: string) => describeEvent({ ...fired, trigger_id: triggerId }, ctx).text;
    expect(text('drain_folk_talk')).toBe('The trigger for entering the drain warren fires.');
    expect(text('landing')).toBe("The trigger for entering the priory on Corvane's Holm fires.");
    expect(text('relic')).toBe('The trigger for finding the Hand of Saint Corvane fires.');
    expect(text('home')).toBe('The trigger for arriving in Hollin Ferry fires.');
    expect(text('lever')).toBe('The trigger for setting the crypt lever flag fires.');
  });
});

describe('osrlib message oddities (reported)', () => {
  it.each([
    // Reported: "The party enters town town."
    ['The party enters town town.', 'The party arrives in Hollin Ferry.'],
    // Reported: "The fallen leave behind ." osrlib writes it when the fallen drop only coins worth less than 1 gp.
    ['The fallen leave behind .', 'The fallen leave a few coins behind.'],
    // osrlib writes an empty list when the goods were coins worth less than 1 gp.
    ['character-0001 drops .', 'Brenna drops a few coins.'],
    // Reported: "— the party is surprised".
    [
      "Encounter: 3 goblins at 60' — the party is surprised.",
      "Encounter: 3 goblins at 60', and the party is surprised.",
    ],
  ])('rewrites %s', (message, expected) => {
    expect(humanizeMessage(message, base)).toBe(expected);
  });

  it('says the town when its name is unknown', () => {
    expect(humanizeMessage('The party enters town town.', contextFromPlayerView({}))).toBe(
      'The party arrives in town.',
    );
  });

  it('describes a drop of coins worth less than 1 gp as coins, never as nothing', () => {
    const line = describeEvent(
      {
        event_type: 'loot_dropped',
        code: 'encounter.loot.dropped',
        visibility: 'player',
        item_ids: [],
        coins_gp_value: 0,
      },
      base,
    );
    // osrlib sends loot_dropped only when something dropped, and rounds coins down to whole gold pieces, so this
    // is a pile such as 39 cp.
    expect(line.text).toBe('The fallen leave a few coins behind.');
    expect(line.detail).toBe('The coins are worth less than 1 gp.');
  });

  it('never emits the oddities for any message or event in the captured outcomes', () => {
    for (const fixture of outcomes as unknown as Array<{
      view: Parameters<typeof contextFromPlayerView>[0];
      outcome: { events?: Parameters<typeof describeEvents>[0]; messages?: string[] };
    }>) {
      const ctx = contextFromPlayerView(fixture.view);
      const texts = [
        ...(fixture.outcome.messages ?? []).map((message) => humanizeMessage(message, ctx)),
        ...describeEvents(fixture.outcome.events ?? [], ctx, {
          messages: fixture.outcome.messages ?? [],
        }).flatMap((line) => [line.text, line.detail ?? '']),
      ];
      for (const text of texts) {
        expect(text).not.toMatch(/[–—]/);
        expect(text).not.toMatch(/\btown town\b/i);
        expect(text).not.toMatch(/\s[.,]/);
        expect(text).not.toMatch(/\(-?\d+, -?\d+\)/);
      }
    }
  });
});

describe('parentheses in sentences (reported)', () => {
  const ctx = extendContextWithEntryNames(emptyContext(), {
    members: { 'character-0001': 'Brenna', 'character-0002': 'Wren' },
  });
  const line = (event: Record<string, unknown>) =>
    describeEvent({ visibility: 'player', ...event } as Parameters<typeof describeEvent>[0], ctx);

  it('writes an interrupted rest as two sentences', () => {
    // Reported: "The party's rest is interrupted (it planned a night)."
    for (const [kind, length] of [
      ['night', 'a night'],
      ['day', 'a full day'],
      ['turn', 'one turn'],
    ]) {
      expect(line({ event_type: 'rested', code: 'exploration.rest.interrupted', kind }).text).toBe(
        `The party's rest is interrupted. It had planned to rest for ${length}.`,
      );
    }
  });

  it('writes the other asides as plain clauses', () => {
    expect(
      line({
        event_type: 'wandering_check',
        code: 'exploration.wandering.none',
        roll: null,
        chance: 1,
        encounter: false,
      }).detail,
    ).toBe('No die rolled. The chance was 1 in 6.');
    expect(
      line({
        event_type: 'spell_declared',
        code: 'battle.spell.declared',
        caster_id: 'character-0002',
        spell_id: 'cure_light_wounds',
        reversed: true,
      }).text,
    ).toBe('Wren begins casting the reversed form of Cure Light Wounds.');
    expect(
      line({
        event_type: 'spells_memorized',
        code: 'magic.spells.memorized',
        caster_id: 'character-0002',
        prepared: [
          { spell_id: 'sleep', reversed: false },
          { spell_id: 'sleep', reversed: false },
        ],
      }).text,
    ).toBe('Wren memorizes 2 copies of Sleep.');
    expect(
      line({
        event_type: 'healing_purchased',
        code: 'town.healing.purchased',
        character_id: 'character-0001',
        service: 'cure_light_wounds',
        cost_gp: 15,
        payers: ['character-0001', 'character-0002'],
        payments_gp: [10, 5],
      }).detail,
    ).toBe('Brenna pays 10 gp and Wren pays 5 gp.');
    expect(
      line({
        event_type: 'npc_party_spawned',
        code: 'encounter.npc_party.spawned',
        party_kind: 'basic',
        alignment: 'chaotic',
        npc_ids: ['npc-0001'],
        class_ids: ['fighter'],
        levels: [2],
      }).text,
    ).toBe('A party of chaotic low-level NPC adventurers takes the field: Fighter 2.');
  });

  it('leaves no parenthetical aside in the text or detail of any sample event', () => {
    for (const fixture of outcomes as unknown as Array<{
      view: Parameters<typeof contextFromPlayerView>[0];
      outcome: { events?: Parameters<typeof describeEvents>[0] };
    }>) {
      for (const described of describeEvents(
        fixture.outcome.events ?? [],
        contextFromPlayerView(fixture.view),
      )) {
        // A sentence holds no "(...)" aside. A detail may quote the rules text of a monster's power, which
        // has its own parentheses, so only the narrated sentence is checked.
        expect(described.text).not.toMatch(/\([a-z][^)]*\)/);
      }
    }
  });
});

describe('monster names in feed history (reported)', () => {
  const attack = [
    {
      event_type: 'attack_rolled',
      code: 'combat.attack.hit',
      visibility: 'player',
      attacker_id: 'monster-0003',
      defender_id: 'character-0001',
      attack_name: 'weapon',
      roll: 15,
      modifier: 0,
      total: 15,
      required: 12,
      defender_ac: 5,
      natural: null,
      back_stab: false,
    },
    {
      event_type: 'damage_dealt',
      code: 'combat.damage.dealt',
      visibility: 'player',
      target_id: 'character-0001',
      attacker_id: 'monster-0003',
      amount: 5,
      rolls: [5],
      keys: [],
      non_regenerable: false,
    },
  ] as unknown as Parameters<typeof describeEvents>[0];
  const party = extendContextWithEntryNames(emptyContext(), { members: { 'character-0001': 'Osric' } });

  it('names a monster from the entry names once the encounter has left the player view', () => {
    // Reported: "A monster hits Osric for 5 damage." from history, where the live round read "A goblin hits Osric".
    expect(describeEvents(attack, party)[0]?.text).toMatch(/^A monster hits Osric/);
    const named = extendContextWithEntryNames(party, {
      monsters: { 'monster-0003': { label: 'goblin', label_plural: 'goblins' } },
      groups: { 'group-0001': { label: 'goblin', label_plural: 'goblins' } },
    });
    expect(describeEvents(attack, named)[0]?.text).toMatch(/^A goblin hits Osric/);
  });

  it("keeps a disguised monster's label when its defeat names the true template", () => {
    const named = extendContextWithEntryNames(party, {
      monsters: { 'monster-0003': { label: 'robed corpse', label_plural: 'robed corpses' } },
    });
    const defeat = [
      ...attack,
      {
        event_type: 'monster_defeated',
        code: 'battle.monster.slain',
        visibility: 'player',
        monster_id: 'monster-0003',
        template_id: 'drowned_prior',
        outcome: 'slain',
        xp: 50,
      },
    ] as unknown as Parameters<typeof describeEvents>[0];
    const text = describeEvents(defeat, named)
      .map((described) => `${described.text} ${described.detail ?? ''}`)
      .join(' ');
    expect(text).toMatch(/robed corpse/);
    expect(text.toLowerCase()).not.toMatch(/prior/);
  });

  it('leaves the context alone without names', () => {
    expect(extendContextWithEntryNames(party, undefined)).toBe(party);
  });
});

describe('names with a leading article (D-404, D-208)', () => {
  it('reads a leading "The" as "the" in the middle of a sentence, and keeps the rest', () => {
    expect(nameInSentence("The priory on Corvane's Holm")).toBe("the priory on Corvane's Holm");
    expect(nameInSentence('The Barrow')).toBe('the Barrow');
    expect(nameInSentence('Hollin Ferry')).toBe('Hollin Ferry');
    expect(placeInSentence("The priory on Corvane's Holm")).toBe("the priory on Corvane's Holm");
    expect(placeInSentence('Gatehouse stair')).toBe('the gatehouse stair');
    expect(placeInSentence('Drain Folk warren')).toBe('the Drain Folk warren');
  });
});

describe('class names in the middle of a sentence', () => {
  it('lowers a common class name and keeps the capitals of a proper name', () => {
    expect(classInSentence('Fighter')).toBe('fighter');
    expect(classInSentence('Magic-User')).toBe('magic-user');
    expect(classInSentence('Hollow knight')).toBe('hollow knight');
    expect(classInSentence('Warlock of Sarn')).toBe('warlock of Sarn');
    expect(classInSentence('Knight of the Silver Hand')).toBe('knight of the Silver Hand');
    expect(classInSentence('Hollow Knight')).toBe('Hollow Knight');
  });
});

describe('dungeon names for players (D-210)', () => {
  const entered = {
    event_type: 'location_entered',
    code: 'exploration.location.entered',
    visibility: 'player',
    location_kind: 'dungeon',
    location_id: 'priory',
    level_number: 1,
    dungeon_id: null,
    narrative: null,
    via: 'placed',
    transition_ref: null,
  } as unknown as Parameters<typeof describeEvent>[0];

  it('names the dungeon from the player view, as the town and the referee do', () => {
    // Reported: a player's log read "The party is placed in the priory, level 1."
    expect(describeEvent(entered, emptyContext()).text).toBe('The party is placed in the priory, level 1.');
    const ctx = contextFromPlayerView({ dungeons: [{ id: 'priory', name: "The priory on Corvane's Holm" }] });
    expect(describeEvent(entered, ctx).text).toBe(
      "The party is placed in the priory on Corvane's Holm, level 1.",
    );
    expect(humanizeMessage('The party enters dungeon priory (level 1).', ctx)).toBe(
      "The party enters the priory on Corvane's Holm, level 1.",
    );
  });
});

describe('talking and the bearing (D-304)', () => {
  const stance = (value: string) => ({
    event_type: 'stance_changed',
    code: 'encounter.stance.changed',
    visibility: 'player',
    stance: value,
  });
  const names = {
    members: { 'character-0003': 'Osric' },
    groups: { 'group-0001': { label: 'goblin', label_plural: 'goblins', count: 2 } },
    monsters: {},
    items: {},
  };

  it('names the speaker of a talk', () => {
    // Reported: the talk entry said only "The monsters are uncertain."
    const lines = describeGameEntry(
      { command_type: 'parley', actor_id: 'character-0003', events: [stance('uncertain')] as never, names },
      emptyContext(),
    );
    expect(lines.map((line) => line.text)).toEqual(['Osric talks to the goblins. They are uncertain now.']);
  });

  it('states one bearing when the bearing changes within one entry', () => {
    // Reported: "The monsters are uncertain." and then "The monsters pay the party no mind." in one entry.
    const lines = describeEvents([stance('uncertain'), stance('indifferent')] as never, emptyContext());
    expect(lines.map((line) => line.text)).toEqual(['The monsters pay the party no mind.']);
  });
});

describe('group labels that are proper names (sample adventures)', () => {
  const started = (name: string, plural: string, count: number) =>
    ({
      event_type: 'encounter_started',
      code: 'encounter.started',
      visibility: 'player',
      monster_name: name,
      monster_name_plural: plural,
      count,
      distance_feet: 30,
      party_surprised: false,
      monsters_surprised: false,
    }) as unknown as Parameters<typeof describeEvent>[0];
  const loft = extendContextWithEntryNames(emptyContext(), {
    members: { 'character-0001': 'Osric' },
    groups: {
      'group-0001': { label: 'Mag Corrie', label_plural: 'Mag Corries', count: 1 },
      'group-0002': { label: "Mag's bodyguard", label_plural: "Mag's bodyguards", count: 1 },
    },
    monsters: {
      'monster-0001': { label: 'Mag Corrie', label_plural: 'Mag Corries' },
      'monster-0002': { label: "Mag's bodyguard", label_plural: "Mag's bodyguards" },
    },
  });

  it('lists each group when an encounter starts', () => {
    // Reported: "Encounter: 2 Mag Corries".
    expect(describeEvent(started('Mag Corrie', 'Mag Corries', 2), loft).text).toBe(
      "The party meets Mag Corrie and Mag's bodyguard, 30 feet away.",
    );
    expect(humanizeMessage("Encounter: 2 Mag Corries at 30'.", loft)).toBe(
      "Encounter: Mag Corrie and Mag's bodyguard at 30'.",
    );
    const clerk = extendContextWithEntryNames(emptyContext(), {
      groups: {
        'group-0001': { label: 'ink-stained clerk', label_plural: 'ink-stained clerks', count: 1 },
        'group-0002': { label: 'bandit', label_plural: 'bandits', count: 1 },
      },
    });
    expect(describeEvent(started('ink-stained clerk', 'ink-stained clerks', 2), clerk).text).toBe(
      'The party meets an ink-stained clerk and a bandit, 30 feet away.',
    );
  });

  it('never pluralizes a proper name without the groups', () => {
    // Reported: "3 Gashnak One-Ears". The event counts every monster, under the first group's label.
    expect(describeEvent(started('Gashnak One-Ear', 'Gashnak One-Ears', 3), emptyContext()).text).toBe(
      'The party meets Gashnak One-Ear and 2 others, 30 feet away.',
    );
    expect(humanizeMessage("Encounter: 3 Gashnak One-Ears at 30'.", emptyContext())).toBe(
      "Encounter: Gashnak One-Ear and 2 others at 30'.",
    );
    expect(describeEvent(started('robed corpse', 'robed corpses', 3), emptyContext()).text).toBe(
      'The party meets 3 robed corpses, 30 feet away.',
    );
  });

  it('puts no article before a proper name in attacks, flight, and morale', () => {
    const attack = {
      event_type: 'attack_rolled',
      code: 'combat.attack.hit',
      visibility: 'player',
      attacker_id: 'monster-0001',
      defender_id: 'character-0001',
      attack_name: 'weapon',
      roll: 15,
      modifier: 0,
      total: 15,
      required: 12,
      defender_ac: 5,
      natural: null,
      back_stab: false,
    };
    expect(describeEvents([attack] as never, loft)[0]?.text).toMatch(/^Mag Corrie hits Osric/);
    expect(
      describeEvent(
        {
          event_type: 'monster_fled',
          code: 'battle.side.fled',
          visibility: 'player',
          group_id: 'group-0001',
        } as never,
        loft,
      ).text,
    ).toBe('Mag Corrie breaks and runs.');
    const morale = describeEvent(
      {
        event_type: 'morale_checked',
        code: 'combat.morale.broke',
        visibility: 'player',
        subject: 'group-0002',
        score: 8,
        roll: 10,
        modifier: 0,
        held: false,
      } as never,
      loft,
    ).text;
    expect(morale).toMatch(/^Mag's bodyguard/);
    expect(morale).not.toMatch(/\bthe Mag/);
  });

  it("never shows a slain monster's template ID to a player", () => {
    const message = 'monster-0001 (drowned_prior) is slain.';
    const corpse = extendContextWithEntryNames(emptyContext(), {
      monsters: { 'monster-0001': { label: 'robed corpse', label_plural: 'robed corpses' } },
    });
    expect(humanizeMessage(message, corpse)).toBe('A robed corpse is slain.');
    expect(humanizeMessage(message, emptyContext())).toBe('A monster is slain.');
    const slain = describeEvents(
      [
        {
          event_type: 'monster_defeated',
          code: 'battle.monster.defeated',
          visibility: 'player',
          monster_id: 'monster-0001',
          template_id: 'drowned_prior',
          outcome: 'slain',
          xp: 50,
        },
      ] as never,
      emptyContext(),
    )[0]?.text;
    expect(slain).not.toMatch(/prior|\(/i);
  });
});

describe('flags in words (referee confirmations)', () => {
  const flagSet = (key: string, value: unknown) =>
    ({ event_type: 'flag_set', code: 'session.flag.set', visibility: 'referee', key, value }) as never;

  it('names a flag by the words of its key and writes the value in words', () => {
    // Reported: "The referee sets the flag priory.lever to true".
    expect(describeEvent(flagSet('priory.lever', true), emptyContext()).text).toBe(
      'The referee sets the priory lever flag to on.',
    );
    expect(flagValueText(false)).toBe('off');
    expect(flagValueText('laid_to_rest')).toBe('"laid_to_rest"');
    expect(flagName('quest.bell', emptyContext())).toBe('the quest bell flag');
  });

  it('says what sets and reads a flag, from the adventure', () => {
    const priory = extendContextWithReferee(emptyContext(), { adventure: bell.payload } as never);
    const sluice = describeEvent(flagSet('priory.sluice', 'open'), priory);
    expect(sluice.text).toBe('The referee sets the priory sluice flag to "open".');
    expect(sluice.detail).toMatch(/^Also set by entering the sluice room\./);
    const toll = extendContextWithReferee(emptyContext(), { adventure: bridge.payload } as never);
    expect(describeEvent(flagSet('bridge.captain', 'beaten'), toll).detail).toMatch(
      /Checked by the trigger for entering the toll gate\./,
    );
  });
});

describe('The Toll at Crookback Bridge read-through', () => {
  const placed = (kind: string, id: string, extra: Record<string, unknown> = {}) =>
    ({
      event_type: 'location_entered',
      code: 'exploration.location.entered',
      visibility: 'player',
      location_kind: kind,
      location_id: id,
      level_number: 1,
      dungeon_id: kind === 'area' ? 'bridge' : null,
      narrative: null,
      via: 'placed',
      transition_ref: null,
      ...extra,
    }) as never;

  it('gives a proper place name no added article', () => {
    // Reported: "The party is placed in the Crookback Bridge, level 1."
    const ctx = contextFromPlayerView({ dungeons: [{ id: 'bridge', name: 'Crookback Bridge' }] });
    expect(describeEvent(placed('dungeon', 'bridge'), ctx).text).toBe(
      'The party is placed in Crookback Bridge, level 1.',
    );
    expect(describeEvent(placed('dungeon', 'bridge', { via: 'entrance' }), ctx).text).toMatch(
      / Crookback Bridge, level 1\.$/,
    );
    expect(humanizeMessage('The party enters dungeon bridge (level 1).', ctx)).toBe(
      'The party enters Crookback Bridge, level 1.',
    );
    expect(placeInSentence('Crookback Bridge')).toBe('Crookback Bridge');
    expect(placeInSentence('The Kingsway')).toBe('the Kingsway');
    expect(placeInSentence('Chapel of Saint Corvane')).toBe('the chapel of Saint Corvane');
    expect(placeInSentence("Captain's loft")).toBe("the captain's loft");
    expect(placeInSentence('Ledge under the arch')).toBe('the ledge under the arch');
    expect(placeInSentence('Toll gate')).toBe('the toll gate');
  });

  const loft = {
    members: { 'character-0003': 'Osric', 'character-0002': 'Mira' },
    groups: {
      'group-0001': { label: 'Mag Corrie', label_plural: 'Mag Corries', count: 1, size: 1 },
      'group-0002': { label: "Mag's bodyguard", label_plural: "Mag's bodyguards", count: 1, size: 1 },
    },
    monsters: {},
    items: {},
  };

  it('names both groups of a talk', () => {
    // Reported: "Osric talks to the monsters."
    const lines = describeGameEntry(
      {
        command_type: 'parley',
        actor_id: 'character-0003',
        events: [
          {
            event_type: 'stance_changed',
            code: 'encounter.stance.changed',
            visibility: 'player',
            stance: 'uncertain',
          },
        ] as never,
        names: loft,
      },
      emptyContext(),
    );
    expect(lines[0]?.text).toBe("Osric talks to Mag Corrie and Mag's bodyguard. They are uncertain now.");
  });

  it('counts like items in a drop', () => {
    // Reported: "...a magic item, a gem or jewel, a gem or jewel, a gem or jewel, and a gem or jewel."
    const drop = {
      event_type: 'loot_dropped',
      code: 'encounter.loot.dropped',
      visibility: 'player',
      item_ids: ['magic-item-0001', 'valuable-0001', 'valuable-0002', 'valuable-0003', 'valuable-0004'],
      coins_gp_value: 0,
    } as never;
    expect(describeEvent(drop, emptyContext()).text).toBe(
      'The fallen leave behind a magic item and 4 gems or jewels.',
    );
    const named = extendContextWithNames(emptyContext(), { 'valuable-0001': 'ruby' });
    expect(describeEvent(drop, named).text).toBe(
      'The fallen leave behind a magic item, a ruby, and 3 gems or jewels.',
    );
  });

  it('says a fizzled attack in plain words, by the size of the group', () => {
    // Reported: "Mira finds nothing left to strike in the ink-stained clerks" for a group of one.
    const fizzle = (groupId: string) =>
      ({
        event_type: 'declaration_fizzled',
        code: 'battle.melee.fizzled',
        visibility: 'player',
        actor_id: 'character-0002',
        group_id: groupId,
        reason: 'battle.declaration.no_target',
      }) as never;
    const ctx = extendContextWithEntryNames(emptyContext(), {
      ...loft,
      groups: {
        ...loft.groups,
        'group-0001': { ...loft.groups['group-0001'], count: 0 },
        'group-0003': { label: 'ink-stained clerk', label_plural: 'ink-stained clerks', count: 0, size: 1 },
        'group-0004': { label: 'bandit', label_plural: 'bandits', count: 0, size: 3 },
      },
    });
    expect(describeEvent(fizzle('group-0003'), ctx).text).toBe(
      'Mira finds nothing left of the ink-stained clerk to strike and makes no attack.',
    );
    expect(describeEvent(fizzle('group-0004'), ctx).text).toBe(
      'Mira finds nothing left of the bandits to strike and makes no attack.',
    );
    expect(describeEvent(fizzle('group-0001'), ctx).text).toBe(
      'Mag Corrie is already down, so Mira makes no attack.',
    );
  });

  it('merges identical reaction rolls of several groups', () => {
    // Reported: "Reaction roll: the monsters are uncertain." twice.
    const roll = (result: string, value: number) => ({
      event_type: 'reaction_rolled',
      code: 'encounter.reaction.rolled',
      visibility: 'referee',
      roll: value,
      modifier: 0,
      total: value,
      result,
      bands: [],
    });
    const same = describeEvents([roll('uncertain', 7), roll('uncertain', 8)] as never, emptyContext());
    expect(same.map((line) => line.text)).toEqual([
      'Reaction rolls for 2 groups: the monsters are uncertain.',
    ]);
    expect(same[0]?.detail).toBe('Rolled 7 +0 = 7 on 2d6. Rolled 8 +0 = 8 on 2d6.');
    const different = describeEvents([roll('uncertain', 7), roll('hostile', 4)] as never, emptyContext());
    expect(different).toHaveLength(2);
  });
});

describe('every template that names a group, against each kind of label and count', () => {
  const kinds = [
    { label: 'goblin', plural: 'goblins' },
    { label: 'Gashnak One-Ear', plural: 'Gashnak One-Ears' },
    { label: "Mag's bodyguard", plural: "Mag's bodyguards" },
  ];
  const events = (groupId: string) => [
    { event_type: 'monster_fled', code: 'battle.side.fled', group_id: groupId },
    { event_type: 'group_moved', code: 'battle.group.moved', group_id: groupId, distance_feet: 5 },
    {
      event_type: 'member_moved',
      code: 'battle.member.moved',
      character_id: 'character-0001',
      group_id: groupId,
      move: 'close',
      distance_feet: 5,
    },
    {
      event_type: 'morale_checked',
      code: 'combat.morale.broke',
      subject: groupId,
      score: 7,
      roll: 9,
      modifier: 0,
      held: false,
    },
    {
      event_type: 'declaration_fizzled',
      code: 'battle.melee.fizzled',
      actor_id: 'character-0001',
      group_id: groupId,
      reason: 'battle.declaration.not_in_front_rank',
    },
    {
      event_type: 'attack_rolled',
      code: 'combat.attack.hit',
      attacker_id: 'monster-0001',
      defender_id: 'character-0001',
      attack_name: 'weapon',
      roll: 15,
      modifier: 0,
      total: 15,
      required: 12,
      defender_ac: 5,
      natural: null,
      back_stab: false,
    },
  ];

  for (const kind of kinds) {
    for (const count of [1, 2, 5]) {
      it(`reads "${kind.label}" with ${count} alive`, () => {
        const ctx = extendContextWithEntryNames(emptyContext(), {
          members: { 'character-0001': 'Osric' },
          groups: { 'group-0001': { label: kind.label, label_plural: kind.plural, count, size: count } },
          monsters: { 'monster-0001': { label: kind.label, label_plural: kind.plural } },
        });
        const text = events('group-0001')
          .map((event) => describeEvent({ visibility: 'player', ...event } as never, ctx).text)
          .join(' ');
        const proper = /^[A-Z]/.test(kind.label);
        if (proper) {
          // A proper name takes no article. With one alive it takes no plural either.
          expect(text).not.toMatch(new RegExp(`\\b(a|an|the) ${kind.label}`, 'i'));
          if (count === 1) expect(text).not.toContain(kind.plural);
        } else if (count === 1) {
          expect(text).toContain('the goblin ');
          expect(text).not.toContain('goblins');
        } else {
          expect(text).toContain('the goblins');
        }
        expect(text).not.toMatch(/\ba [A-Z]/);
      });
    }
  }
});

describe('the final QA pass (R-504, R-505, R-518, R-521)', () => {
  const party = extendContextWithEntryNames(emptyContext(), {
    members: { 'character-0001': 'Brenna', 'character-0002': 'Osric', 'character-0003': 'Tamsin' },
  });
  const events = (list: Record<string, unknown>[]) =>
    list.map((event) => ({ visibility: 'player', ...event })) as never;

  it('writes a spell name as the rules do (R-504)', () => {
    // Reported: "Tamsin memorizes sleep."
    expect(
      describeEvent(
        events([
          {
            event_type: 'spells_memorized',
            code: 'magic.spells.memorized',
            caster_id: 'character-0003',
            prepared: [{ spell_id: 'sleep', reversed: false }],
          },
        ])[0],
        party,
      ).text,
    ).toBe('Tamsin memorizes Sleep.');
  });

  it("sums up a day's upkeep and leaves out members who heal nothing (R-505)", () => {
    const day = events([
      ...['character-0001', 'character-0002', 'character-0003'].flatMap((id) => [
        { event_type: 'provisions', code: 'exploration.provisions.consumed', character_id: id, kind: 'food' },
        {
          event_type: 'provisions',
          code: 'exploration.provisions.consumed',
          character_id: id,
          kind: 'water',
        },
      ]),
      {
        event_type: 'healing_applied',
        code: 'combat.healing.applied',
        target_id: 'character-0001',
        amount: 3,
        source: 'natural',
      },
      {
        event_type: 'healing_applied',
        code: 'combat.healing.applied',
        target_id: 'character-0002',
        amount: 0,
        source: 'natural',
      },
      {
        event_type: 'healing_applied',
        code: 'combat.healing.applied',
        target_id: 'character-0003',
        amount: 0,
        source: 'natural',
      },
      { event_type: 'rested', code: 'exploration.rest.rested', kind: 'day' },
    ]);
    expect(describeEvents(day, party).map((line) => line.text)).toEqual([
      "The party eats and drinks the day's rations.",
      'Brenna regains 3 hit points.',
      'The party rests for a full day.',
    ]);
  });

  it('says what a share of a few copper coins is, never "takes nothing" (R-518)', () => {
    // Reported: after a 2 gp drop split four ways, "Brenna takes nothing."
    const share = {
      event_type: 'item_acquired',
      code: 'exploration.item.acquired',
      character_id: 'character-0001',
      item_ids: [],
      coins_gp_value: 0,
      origin: 'treasure',
    };
    expect(describeEvent(events([share])[0], party).text).not.toMatch(/nothing/);
    expect(describeEvent(events([share])[0], party).text).toMatch(/a few coins/);
    expect(humanizeMessage('character-0001 acquires .', party)).toBe('Brenna acquires a few coins.');
  });

  it("doesn't wake a slain monster (R-521)", () => {
    // Reported: "A goblin is slain." and then "A goblin wakes up."
    const ctx = extendContextWithEntryNames(party, {
      monsters: { 'monster-0001': { label: 'goblin', label_plural: 'goblins' } },
    });
    const lines = describeEvents(
      events([
        {
          event_type: 'monster_defeated',
          code: 'battle.monster.defeated',
          monster_id: 'monster-0001',
          template_id: 'goblin',
          outcome: 'slain',
          xp: 5,
        },
        {
          event_type: 'effect_released',
          code: 'effects.effect.released',
          effect_id: 'effect-0001',
          kind: 'sleep',
          target_ref: 'monster-0001',
        },
        {
          event_type: 'condition_removed',
          code: 'effects.condition.removed',
          target_id: 'monster-0001',
          condition: 'asleep',
        },
      ]),
      ctx,
    ).map((line) => line.text);
    expect(lines).toEqual(['A goblin is slain.']);
  });
});

describe('the last QA run (F-102, F-103, F-204, F-208)', () => {
  const party = extendContextWithEntryNames(emptyContext(), {
    members: { 'character-0001': 'Brenna', 'character-0002': 'Wren', 'character-0003': 'Osric' },
  });

  it("keeps a possessive proper name's capital and gives it no article (F-102)", () => {
    // Reported: "Osric takes a miller Aske's strongbox."
    const ctx = extendContextWithNames(party, { aske_strongbox: "Miller Aske's strongbox" });
    const take = {
      event_type: 'item_acquired',
      code: 'exploration.item.acquired',
      visibility: 'player',
      character_id: 'character-0003',
      item_ids: ['aske_strongbox'],
      coins_gp_value: 73,
      origin: 'treasure',
    } as never;
    expect(describeEvent(take, ctx).text).toBe("Osric takes Miller Aske's strongbox and coins worth 73 gp.");
    expect(itemPhrase(itemNounFromName("Prior's iron key"))).toBe("a prior's iron key");
  });

  it('says that a share counts its coins rounded down, not that coins went missing (F-208)', () => {
    // Reported: 7 gp split three ways read "2 gp" each. osrlib shares out every coin; each share's worth is
    // rounded down, and the odd coins go to the front of the marching order.
    const share = describeEvent(
      {
        event_type: 'item_acquired',
        code: 'exploration.item.acquired',
        visibility: 'player',
        character_id: 'character-0001',
        item_ids: [],
        coins_gp_value: 2,
        origin: 'treasure',
      } as never,
      party,
    );
    expect(share.text).toBe('Brenna takes coins worth 2 gp.');
    expect(share.detail).toMatch(/rounded down/);
  });

  it('says what a member kept of a capped award (F-204)', () => {
    // Reported: "Wren gains 2,600 experience points." when the award was capped at 2,399.
    const award = {
      event_type: 'xp_awarded',
      code: 'session.xp.awarded',
      visibility: 'player',
      character_id: 'character-0002',
      award: 2600,
      modified_award: 2600,
      level_after: 2,
    };
    const lines = describeGameEntry(
      { command_type: 'award_xp', events: [award] as never, xp_gained: { 'character-0002': 2399 } },
      party,
    );
    expect(lines[0]?.text).toBe('Wren gains 2,399 of the 2,600 experience points awarded.');
    const whole = describeGameEntry(
      { command_type: 'award_xp', events: [award] as never, xp_gained: { 'character-0002': 2600 } },
      party,
    );
    expect(whole[0]?.text).toBe('Wren gains 2,600 experience points.');
  });

  it('writes a line for a wait that changes nothing the players can see (F-103)', () => {
    const lines = describeGameEntry(
      {
        command_type: 'wait',
        actor_id: null,
        events: [],
        names: {
          groups: {
            'group-0001': {
              label: 'ink-stained clerk',
              label_plural: 'ink-stained clerks',
              count: 1,
              size: 1,
            },
            'group-0002': { label: 'bandit', label_plural: 'bandits', count: 1, size: 1 },
          },
        },
      },
      party,
    );
    expect(lines.map((line) => line.text)).toEqual([
      'The party waits. The ink-stained clerk and the bandit hold back.',
    ]);
    const alone = describeGameEntry(
      {
        command_type: 'wait',
        events: [],
        names: {
          groups: { 'group-0001': { label: 'Mag Corrie', label_plural: 'Mag Corries', count: 1, size: 1 } },
        },
      },
      party,
    );
    expect(alone[0]?.text).toBe('The party waits. Mag Corrie holds back.');
  });
});
