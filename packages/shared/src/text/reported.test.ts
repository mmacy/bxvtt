/**
 * Tests for text that feature engineers reported from real play. Each test reproduces the reported output with
 * the inputs that produced it, and states the text the layer writes now.
 */
import { describe, expect, it } from 'vitest';
import codes from './data/codes.json' with { type: 'json' };
import outcomes from './fixtures/outcomes.json' with { type: 'json' };
import {
  contextFromPlayerView,
  describeEvent,
  describeEvents,
  equipmentNoun,
  describeGameEntry,
  emptyContext,
  extendContextWithCatalog,
  extendContextWithEntryNames,
  extendContextWithScene,
  nameInSentence,
  placeInSentence,
  extendContextWithNames,
  extendContextWithReferee,
  humanizeMessage,
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

/** `game.scene.names` as the bxvtt server sends it: catalog lot names, masked names, and authored names. */
const sceneNames: Record<string, string> = {
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

/** The client's workaround: it copies `scene.names` into `ctx.items` with the article stripped. */
function copiedByHand(ctx: TextContext): TextContext {
  const items = { ...ctx.items };
  for (const [id, name] of Object.entries(sceneNames)) items[id] = stripArticle(name);
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
    ['scene names copied into ctx.items', copiedByHand(base)],
    ['extendContextWithNames', extendContextWithNames(base, sceneNames)],
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
    const ctx = extendContextWithNames(base, sceneNames);
    expect(resolveItemNoun('torch', ctx)).toEqual(equipmentNoun('torch'));
    expect(itemPhrase(resolveItemNoun('torch', ctx), 6)).toBe('6 torches');
    expect(itemPhrase(resolveItemNoun('holy_water', ctx))).toBe('a vial of holy water');
    expect(itemPhrase(resolveItemNoun('moon_blade', ctx, { name: 'Moon blade' }))).toBe('a moon blade');
    expect(itemPhrase(resolveItemNoun('hand_of_saint_corvane', ctx))).toBe('the Hand of Saint Corvane');
    expect(itemPhrase(resolveItemNoun('thieves_tools', ctx))).toBe("thieves' tools");
    expect(itemPhrase(resolveItemNoun('thieves_tools', ctx), 2)).toBe("2 sets of thieves' tools");
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
    ['character-0001 drops .', 'Brenna drops nothing.'],
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
    ).toBe('Wren begins casting the reversed form of cure light wounds.');
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
    ).toBe('Wren memorizes 2 copies of sleep.');
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

  it('names the dungeon from the scene, as the town and the referee do', () => {
    // Reported: a player's log read "The party is placed in the priory, level 1."
    expect(describeEvent(entered, emptyContext()).text).toBe('The party is placed in the priory, level 1.');
    const ctx = extendContextWithScene(emptyContext(), {
      names: {},
      dungeon_names: { priory: "The priory on Corvane's Holm" },
    });
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
    ).toBe('Mag Corrie flees.');
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
