import type { EncounterGroupView, EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody } from '@bxvtt/shared/protocol';
import { emptyContext, contextFromPlayerView } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import {
  spellModeOptions,
  spellRangeText,
  blockedReason,
  blockingMembers,
  describeDeclaration,
  attackPlans,
  memberGear,
  nearestGroup,
  refusalTexts,
  repeatProblem,
  usableItems,
} from './model';

function battle() {
  const snapshot = fixtureSnapshot('battle', 'player');
  const game = snapshot.game;
  if (!game?.view.encounter) throw new Error('The battle fixture has no encounter.');
  return { view: game.view, encounter: game.view.encounter, party: game.view.party };
}

function member(party: readonly MemberView[], name: string): MemberView {
  const found = party.find((m) => m.name === name);
  if (!found) throw new Error(`No ${name} in the fixture.`);
  return found;
}

function withGroup(encounter: EncounterView, patch: Partial<EncounterGroupView>): EncounterView {
  const [group, ...rest] = encounter.groups;
  if (!group) throw new Error('No group.');
  return { ...encounter, groups: [{ ...group, ...patch }, ...rest] };
}

const sling = {
  instance_type: 'item',
  template: {
    item_type: 'weapon',
    id: 'sling',
    name: 'Sling',
    qualities: ['blunt', 'missile'],
    missile_ranges: { short: { max_feet: 40 }, medium: { max_feet: 80 }, long: { max_feet: 160 } },
  },
  quantity: 1,
};

describe('attackPlans', () => {
  it('offers to close in and attack a group the member doesn’t stand against, however far it is', () => {
    const { encounter, party } = battle();
    const brenna = { ...member(party, 'Brenna'), encounter_rate_feet: 20 };
    const group = withGroup(encounter, { member_distance_feet: { [brenna.id]: 200 } }).groups[0];
    if (!group) throw new Error('No group.');
    const plans = attackPlans(brenna, encounter, group, memberGear(brenna, emptyContext()));
    expect(plans.map((p) => [p.kind, p.reason])).toEqual([['close', null]]);
    expect(plans[0]?.distance).toBe(200);
  });

  it('attacks where the member stands when they are in the group’s front rank', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const group = withGroup(encounter, { front_rank: [brenna.id], member_distance_feet: { [brenna.id]: 5 } })
      .groups[0];
    if (!group) throw new Error('No group.');
    expect(
      attackPlans(brenna, encounter, group, memberGear(brenna, emptyContext())).map((p) => p.kind),
    ).toEqual(['melee']);
  });

  it('offers a shot with a wielded missile weapon at any distance, and a close beside it', () => {
    const { encounter, party } = battle();
    const wren = member(party, 'Wren');
    const armed = { ...wren, inventory: { ...wren.inventory, wielded: [sling] } };
    const group = withGroup(encounter, { member_distance_feet: { [wren.id]: 500 } }).groups[0];
    if (!group) throw new Error('No group.');
    const plans = attackPlans(armed, encounter, group, memberGear(armed, emptyContext()));
    expect(plans.map((p) => p.kind)).toEqual(['missile', 'close']);
    expect(plans[0]?.weapon?.id).toBe('sling');
  });

  it('keeps a reloading weapon’s shot, unavailable with the reason, for a member bxapi lists as reloading', () => {
    const { encounter, party } = battle();
    const wren = member(party, 'Wren');
    const crossbow = {
      ...sling,
      template: { ...sling.template, id: 'crossbow', name: 'Crossbow', qualities: ['missile', 'reload'] },
    };
    const armed = { ...wren, inventory: { ...wren.inventory, wielded: [crossbow] } };
    const group = encounter.groups[0];
    if (!group) throw new Error('No group.');
    const reloading = { ...encounter, reloading: [wren.id] };
    const plans = attackPlans(armed, reloading, group, memberGear(armed, emptyContext()));
    expect(plans.map((p) => [p.kind, p.reason])).toEqual([
      ['missile', 'Wren is reloading a crossbow this round.'],
      ['close', null],
    ]);
  });

  it('says the member can’t move when bxapi lists them as immobile', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const stuck = { ...encounter, immobile: [brenna.id] };
    const group = stuck.groups[0];
    if (!group) throw new Error('No group.');
    expect(attackPlans(brenna, stuck, group, memberGear(brenna, emptyContext()))[0]?.reason).toBe(
      "Brenna can't move this round.",
    );
  });
});

describe('nearestGroup', () => {
  it('picks the nearer of two groups', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const far = {
      ...encounter.groups[0],
      id: 'group-0002',
      member_distance_feet: { [brenna.id]: 90 },
    } as EncounterGroupView;
    const near = {
      ...encounter.groups[0],
      id: 'group-0003',
      member_distance_feet: { [brenna.id]: 10 },
    } as EncounterGroupView;
    expect(nearestGroup({ ...encounter, groups: [far, near] }, brenna.id)?.id).toBe('group-0003');
  });
});

describe('describeDeclaration', () => {
  it('names a hide as the button the player pressed', () => {
    const ctx = contextFromPlayerView(battle().view);
    expect(describeDeclaration({ action: 'hide' }, ctx)).toBe('Hide in shadows');
  });

  it('names an action it has no phrase for by its label, never as "An action"', () => {
    const ctx = contextFromPlayerView(battle().view);
    expect(describeDeclaration({ action: 'some_new_action' } as never, ctx)).not.toBe('An action');
  });

  it('names the group and the move', () => {
    const { view } = battle();
    const ctx = contextFromPlayerView(view);
    expect(describeDeclaration({ action: 'attack', target_group_id: 'group-0001', move: 'close' }, ctx)).toBe(
      'Attack the goblins, closing in',
    );
    expect(describeDeclaration({ action: 'move', move: 'fighting_withdrawal' }, ctx)).toBe(
      'Fighting withdrawal',
    );
    expect(
      describeDeclaration({ action: 'cast', spell_id: 'sleep', target_group_id: 'group-0001' }, ctx),
    ).toBe('Cast Sleep at the goblins');
    expect(describeDeclaration({ action: 'hold', gaze_defense: 'avert_eyes' }, ctx)).toBe(
      'Hold, averting eyes',
    );
  });

  it('names a potion given to another member to drink', () => {
    const { view, party } = battle();
    const ctx = contextFromPlayerView(view);
    const brenna = member(party, 'Brenna');
    const potion = {
      instance_type: 'magic_item',
      instance_id: 'magic-item-0001',
      display: 'a potion',
      quantity: 1,
    };
    const carrying = { ...brenna, inventory: { ...brenna.inventory, items: [potion] } };
    const gear = memberGear(carrying, ctx);
    expect(usableItems(gear).map((i) => i.kind)).toEqual(['potion']);
    expect(
      describeDeclaration(
        { action: 'use_item', item_id: 'magic-item-0001', targets: ['character-0002'] },
        ctx,
        gear,
      ),
    ).toBe('Give Wren a potion to drink');
  });
});

describe('repeatProblem', () => {
  it('refuses to repeat an attack on a group that fled', () => {
    const { view, encounter, party } = battle();
    const ctx = contextFromPlayerView(view);
    const brenna = member(party, 'Brenna');
    const fled = withGroup(encounter, { fled: true });
    expect(
      repeatProblem(
        { action: 'attack', target_group_id: 'group-0001' },
        brenna,
        fled,
        memberGear(brenna, ctx),
        ctx,
      ),
    ).toBe('The goblins have escaped.');
    expect(repeatProblem({ action: 'hold' }, brenna, fled, memberGear(brenna, ctx), ctx)).toBeNull();
  });
});

describe('refusalTexts', () => {
  it('puts each refusal with its member and keeps the rest general', () => {
    const { view } = battle();
    const ctx = contextFromPlayerView(view);
    const texts = refusalTexts(
      [
        {
          member_id: 'character-0002',
          code: 'battle.declaration.not_in_front_rank',
          params: { character: 'character-0002' },
        },
        { member_id: null, code: 'combat.attack.out_of_reach', params: { distance_feet: 40 } },
      ],
      ctx,
    );
    expect(texts.byMember['character-0002']?.[0]).toMatch(/Wren/);
    expect(texts.general).toHaveLength(1);
  });
});

describe('blockingMembers', () => {
  it('blocks the round for each current declarer that a refusal names, in declarer order', () => {
    const refusals = [
      { member_id: 'character-0002', code: 'battle.declaration.not_in_front_rank', params: {} },
      { member_id: 'character-0001', code: 'combat.attack.out_of_reach', params: {} },
    ];
    expect(blockingMembers(refusals, ['character-0001', 'character-0002'])).toEqual([
      'character-0001',
      'character-0002',
    ]);
  });

  it('ignores a refusal that names a member who is no longer a declarer, or no member', () => {
    const refusals = [
      { member_id: 'character-0004', code: 'combat.attack.out_of_reach', params: {} },
      { member_id: null, code: 'combat.attack.out_of_reach', params: {} },
    ];
    expect(blockingMembers(refusals, ['character-0001', 'character-0002'])).toEqual([]);
  });
});

describe('blockedReason', () => {
  it('agrees in number with the names', () => {
    expect(blockedReason([])).toBeNull();
    expect(blockedReason(['Brenna'])).toBe('Brenna needs a different action first.');
    expect(blockedReason(['Brenna', 'Wren'])).toBe('Brenna and Wren need different actions first.');
  });
});

describe('refusals that name no member', () => {
  it('stay general', () => {
    const { view } = battle();
    const texts = refusalTexts(
      [{ member_id: null, code: 'combat.attack.out_of_reach', params: { distance_feet: 40 } }],
      contextFromPlayerView(view),
    );
    expect(texts.general).toHaveLength(1);
    expect(texts.byMember).toEqual({});
  });
});

describe('describeDeclaration for several monsters', () => {
  const missiles: DeclarationBody = {
    action: 'cast',
    spell_id: 'magic_missile',
    targets: ['monster-0001', 'monster-0002'],
  };

  it('names each monster the player view lists', () => {
    const { view } = battle();
    expect(describeDeclaration(missiles, contextFromPlayerView(view))).toBe(
      'Cast Magic Missile at Goblin 1 and Goblin 2',
    );
  });

  it('counts monsters the player view doesn’t list, because a player can’t tell them apart', () => {
    const { view, encounter } = battle();
    const unlisted = withGroup(encounter, { members: [] });
    expect(describeDeclaration(missiles, contextFromPlayerView({ ...view, encounter: unlisted }))).toBe(
      'Cast Magic Missile at 2 goblins',
    );
  });
});

describe('monster targets by ID', () => {
  it('names a declared target as the encounter numbers it', () => {
    const { view, encounter } = battle();
    const roster = withGroup(encounter, {
      members: [
        { id: 'monster-0001', status: 'defeated' },
        { id: 'monster-0002', status: 'alive' },
      ],
    });
    const ctx = contextFromPlayerView({ ...view, encounter: roster });
    expect(
      describeDeclaration({ action: 'cast', spell_id: 'magic_missile', targets: ['monster-0002'] }, ctx),
    ).toBe('Cast Magic Missile at Goblin 2');
  });
});

describe('repeating last round after the situation changed', () => {
  it('repeats an attack wherever the member stands, and leaves the reach to the preview', () => {
    const { view, encounter, party } = battle();
    const ctx = contextFromPlayerView(view);
    const brenna = { ...member(party, 'Brenna'), encounter_rate_feet: 40 };
    expect(
      repeatProblem(
        { action: 'attack', target_group_id: 'group-0001' },
        brenna,
        encounter,
        memberGear(brenna, ctx),
        ctx,
      ),
    ).toBeNull();
  });
});

describe('spellModeOptions', () => {
  it("labels each mode by osrlib's display name", () => {
    expect(
      spellModeOptions(
        [
          { key: 'darken', display_name: 'Conjure darkness' },
          { key: 'blind', display_name: 'Blind a creature' },
          { key: 'cancel', display_name: 'Cancel light' },
        ],
        'Darkness',
      ),
    ).toEqual([
      { value: 'darken', label: 'Conjure darkness' },
      { value: 'blind', label: 'Blind a creature' },
      { value: 'cancel', label: 'Cancel light' },
    ]);
  });

  it("labels a form's only mode by the form's name, because osrlib labels it from its key", () => {
    expect(spellModeOptions([{ key: 'harm', display_name: 'Harm' }], 'Cause Light Wounds')).toEqual([
      { value: 'harm', label: 'Cause Light Wounds' },
    ]);
  });
});

describe('spellRangeText', () => {
  it('writes a distance in feet as the catalog does, and keeps any other range', () => {
    expect(spellRangeText({ range: '60 feet', range_spec: { kind: 'feet', feet: 60 } })).toBe('60’');
    expect(spellRangeText({ range: '120’', range_spec: { kind: 'feet', feet: 120 } })).toBe('120’');
    expect(spellRangeText({ range: 'The caster', range_spec: { kind: 'caster', feet: null } })).toBe(
      'The caster',
    );
  });
});
