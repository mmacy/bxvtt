import type { EncounterGroupView, EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import { emptyContext, contextFromPlayerView } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import {
  describeDeclaration,
  memberGear,
  membersInReach,
  nearestGroup,
  planAttack,
  quickAttack,
  refusalTexts,
  suggestAction,
  repeatProblem,
  usableItems,
} from './model';
import { encounterCreatures, withCreatureNames } from './text';

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

describe('planAttack', () => {
  it('closes and attacks when the group is within the encounter rate plus 5 feet', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const group = withGroup(encounter, { member_distance_feet: { [brenna.id]: 35 } }).groups[0];
    if (!group) throw new Error('No group.');
    const plan = planAttack(
      { ...brenna, encounter_rate_feet: 30 },
      encounter,
      group,
      memberGear(brenna, emptyContext()),
    );
    expect(plan.kind).toBe('close');
    expect(plan.note).toBe('Closes 30 feet, then attacks.');
  });

  it('explains a group out of reach with the distance and the member’s rate', () => {
    const { encounter, party } = battle();
    const brenna = { ...member(party, 'Brenna'), encounter_rate_feet: 20 };
    const group = encounter.groups[0];
    if (!group) throw new Error('No group.');
    const plan = planAttack(brenna, encounter, group, memberGear(brenna, emptyContext()));
    expect(plan.kind).toBe('out_of_reach');
    expect(plan.reason).toBe('Out of reach: 40 feet away, while Brenna moves 20 feet per round.');
  });

  it('attacks where the member stands when they are in the group’s front rank', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const group = withGroup(encounter, { front_rank: [brenna.id], member_distance_feet: { [brenna.id]: 5 } })
      .groups[0];
    if (!group) throw new Error('No group.');
    expect(planAttack(brenna, encounter, group, memberGear(brenna, emptyContext())).kind).toBe('melee');
  });

  it('shoots with a missile weapon whose long range reaches the group', () => {
    const { encounter, party } = battle();
    const wren = member(party, 'Wren');
    const armed = { ...wren, inventory: { ...wren.inventory, wielded: [sling] } };
    const group = encounter.groups[0];
    if (!group) throw new Error('No group.');
    const plan = planAttack(armed, encounter, group, memberGear(armed, emptyContext()));
    expect(plan.kind).toBe('missile');
    expect(plan.weapon?.id).toBe('sling');
  });

  it('says the member can’t move when they are immobile', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const stuck = { ...encounter, immobile: [brenna.id] };
    const group = stuck.groups[0];
    if (!group) throw new Error('No group.');
    expect(planAttack(brenna, stuck, group, memberGear(brenna, emptyContext())).reason).toMatch(
      /^Brenna can't move this round/,
    );
  });
});

describe('quickAttack', () => {
  it('declares an attack on the nearest group, closing in', () => {
    const { encounter, party } = battle();
    const brenna = { ...member(party, 'Brenna'), encounter_rate_feet: 40 };
    const quick = quickAttack(brenna, encounter, memberGear(brenna, emptyContext()));
    expect(quick?.declaration).toEqual({ action: 'attack', target_group_id: 'group-0001', move: 'close' });
  });

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
    ).toBe('The goblins have fled.');
    expect(repeatProblem({ action: 'hold' }, brenna, fled, memberGear(brenna, ctx), ctx)).toBeNull();
  });
});

describe('membersInReach', () => {
  it('lists members within 5 feet on the range track', () => {
    const { encounter } = battle();
    const spread = {
      ...encounter,
      advance_feet: { 'character-0001': 20, 'character-0002': 15, 'character-0003': 0 },
    };
    expect(membersInReach(spread, 'character-0001')).toEqual(['character-0002']);
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

describe('describeDeclaration for monsters a player can’t tell apart', () => {
  it('counts them instead of listing each', () => {
    const { view } = battle();
    const ctx = contextFromPlayerView(view);
    expect(
      describeDeclaration(
        { action: 'cast', spell_id: 'magic_missile', targets: ['monster-0001', 'monster-0002'] },
        ctx,
      ),
    ).toBe('Cast Magic Missile at 2 goblins');
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
    const ctx = withCreatureNames(contextFromPlayerView(view), encounterCreatures(roster));
    expect(
      describeDeclaration({ action: 'cast', spell_id: 'magic_missile', targets: ['monster-0002'] }, ctx),
    ).toBe('Cast Magic Missile at Goblin 2');
  });
});

describe('suggestAction', () => {
  const facts = { casts: false };
  const unarmoured = (m: MemberView): MemberView => ({
    ...m,
    inventory: { ...m.inventory, worn_armour: null, shield: null },
  });

  it('strikes the group a member already stands against', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const engaged = withGroup(encounter, {
      front_rank: [brenna.id],
      member_distance_feet: { [brenna.id]: 5 },
    });
    expect(suggestAction(brenna, engaged, memberGear(brenna, emptyContext()), facts)?.kind).toBe('melee');
  });

  it('shoots with a missile weapon in range before anything else', () => {
    const { encounter, party } = battle();
    const wren = member(party, 'Wren');
    const armed = { ...wren, inventory: { ...wren.inventory, wielded: [sling] } };
    const suggestion = suggestAction(armed, encounter, memberGear(armed, emptyContext()), facts);
    expect(suggestion?.kind).toBe('missile');
    expect(suggestion?.body).toEqual({ action: 'attack', target_group_id: 'group-0001' });
  });

  it('offers the Cast tab to a caster with a spell ready, and never casts for them', () => {
    const { encounter, party } = battle();
    const osric = {
      ...member(party, 'Osric'),
      memorized_spells: [{ spell_id: 'cure_light_wounds', reversed: false }],
    };
    const suggestion = suggestAction(osric, encounter, memberGear(osric, emptyContext()), { casts: true });
    expect(suggestion).toMatchObject({ kind: 'cast', body: null });
  });

  it('closes in only for an armoured front-line fighter who casts no spells', () => {
    const { encounter, party } = battle();
    const brenna = { ...member(party, 'Brenna'), encounter_rate_feet: 40 };
    const gear = memberGear(brenna, emptyContext());
    expect(suggestAction(brenna, encounter, gear, facts)?.kind).toBe('close');
    // The same member without armour, or of a class that casts, holds instead.
    expect(
      suggestAction(unarmoured(brenna), encounter, memberGear(unarmoured(brenna), emptyContext()), facts)
        ?.kind,
    ).toBe('hold');
    expect(suggestAction(brenna, encounter, gear, { casts: true })?.kind).toBe('hold');
  });

  it('holds a back-rank member with no missile weapon, and says why', () => {
    const { encounter, party } = battle();
    const brenna = member(party, 'Brenna');
    const back = { ...encounter, front_rank: ['character-0002'] };
    const suggestion = suggestAction(brenna, back, memberGear(brenna, emptyContext()), facts);
    expect(suggestion).toMatchObject({ kind: 'hold', body: { action: 'hold' } });
    expect(suggestion?.reason).toBe('Brenna is in the back rank with no missile weapon.');
  });
});

describe('repeating last round after the situation changed', () => {
  it('refuses to repeat a melee attack once the member has fallen back', () => {
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
    ).toBe('Brenna is no longer in reach of the goblins.');
  });
});
