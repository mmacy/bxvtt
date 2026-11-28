import type { EncounterGroupView, EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody } from '@bxvtt/shared/protocol';
import { contextFromPlayerView } from '@bxvtt/shared/text';
import { describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { memberGear } from './model';
import { MAX_PREVIEWS, pickQuickActions, quickCandidates, type QuickAction } from './quick';

function battle() {
  const snapshot = fixtureSnapshot('battle', 'player');
  const view = snapshot.game?.view;
  if (!view?.encounter) throw new Error('The battle fixture has no encounter.');
  return { view, encounter: view.encounter, party: view.party, ctx: contextFromPlayerView(view) };
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

const bodies = (list: readonly QuickAction[]) => list.map((c) => c.body);

describe('quickCandidates', () => {
  const facts = { casts: false };

  it('strikes first the group a member already stands against', () => {
    const { encounter, party, ctx } = battle();
    const brenna = member(party, 'Brenna');
    const engaged = withGroup(encounter, { front_rank: [brenna.id] });
    const list = quickCandidates(brenna, engaged, memberGear(brenna, ctx), ctx, facts);
    expect(list[0]).toMatchObject({
      kind: 'melee',
      body: { action: 'attack', target_group_id: 'group-0001' },
    });
  });

  it('lists a shot at the nearest group however far it is, for bxapi to judge', () => {
    const { encounter, party, ctx } = battle();
    const wren = member(party, 'Wren');
    const armed = { ...wren, inventory: { ...wren.inventory, wielded: [sling] } };
    const far = withGroup(encounter, { member_distance_feet: { [wren.id]: 900 } });
    const list = quickCandidates(armed, far, memberGear(armed, ctx), ctx, facts);
    expect(list[0]).toMatchObject({
      kind: 'missile',
      checked: true,
      body: { action: 'attack', target_group_id: 'group-0001' },
    });
  });

  it('offers the Cast tab to a caster with a spell ready, without asking bxapi', () => {
    const { encounter, party, ctx } = battle();
    const osric = {
      ...member(party, 'Osric'),
      memorized_spells: [{ spell_id: 'cure_light_wounds', reversed: false }],
    };
    const list = quickCandidates(osric, encounter, memberGear(osric, ctx), ctx, { casts: true });
    expect(list.at(-1)).toMatchObject({ kind: 'cast', body: null, checked: false });
  });

  it('tries closing in and attacking, then only closing in, for an armoured front-line fighter', () => {
    const { encounter, party, ctx } = battle();
    const brenna = member(party, 'Brenna');
    const list = quickCandidates(brenna, encounter, memberGear(brenna, ctx), ctx, facts);
    expect(bodies(list)).toEqual([
      { action: 'attack', target_group_id: 'group-0001', move: 'close' },
      { action: 'move', move: 'close', target_group_id: 'group-0001' },
    ]);
    expect(list.map((c) => c.label)).toEqual(['Attack the goblins, closing in', 'Close in on the goblins']);
  });

  it('holds a back-rank member with nothing to try, with no reason under the name', () => {
    const { encounter, party, ctx } = battle();
    const brenna = member(party, 'Brenna');
    const back = { ...encounter, front_rank: ['character-0002'] };
    const list = quickCandidates(brenna, back, memberGear(brenna, ctx), ctx, facts);
    expect(list).toEqual([
      { kind: 'hold', label: 'Hold', body: { action: 'hold' }, reason: null, checked: false },
    ]);
  });

  it('puts a back-stab first for a member bxapi lists in can_back_stab', () => {
    const { encounter, party, ctx } = battle();
    const wren = member(party, 'Wren');
    const list = quickCandidates(wren, encounter, memberGear(wren, ctx), ctx, {
      casts: false,
      canBackStab: true,
    });
    expect(list[0]?.body).toMatchObject({ action: 'attack', back_stab: true, move: 'close' });
  });
});

describe('pickQuickActions', () => {
  const attack: QuickAction = {
    kind: 'close',
    label: 'Attack the goblins, closing in',
    body: { action: 'attack', target_group_id: 'g', move: 'close' },
    reason: null,
    checked: true,
  };
  const close: QuickAction = {
    kind: 'close',
    label: 'Close in on the goblins',
    body: { action: 'move', move: 'close', target_group_id: 'g' },
    reason: null,
    checked: true,
  };
  const cast: QuickAction = {
    kind: 'cast',
    label: 'Choose a spell',
    body: null,
    reason: null,
    checked: false,
  };

  it('takes the first candidate bxapi accepts, judging every member’s candidate in one request', async () => {
    // bxapi refuses the close and attack, which falls short, and accepts the plain close.
    const preview = vi.fn(async (candidates: Record<string, DeclarationBody>) => ({
      revision: 1,
      accepted: Object.keys(candidates).filter((id) => candidates[id]?.action !== 'attack'),
    }));
    const picked = await pickQuickActions(
      { flarg: [attack, close], tinks: [close], mazpar: [cast] },
      preview,
    );
    expect(picked).toEqual({ flarg: close, tinks: close, mazpar: cast });
    expect(preview).toHaveBeenCalledTimes(2);
    expect(preview.mock.calls[0]?.[0]).toEqual({ flarg: attack.body, tinks: close.body });
  });

  it('offers nothing for a member whose candidates bxapi all refuses', async () => {
    const preview = vi.fn(async () => ({ revision: 1, accepted: [] }));
    expect(await pickQuickActions({ flarg: [attack, close] }, preview)).toEqual({ flarg: null });
  });

  it(`asks at most ${MAX_PREVIEWS} times, and offers nothing it couldn't confirm`, async () => {
    const preview = vi.fn(async () => ({ revision: 1, accepted: [] }));
    const many = [attack, close, attack, close, attack];
    expect(await pickQuickActions({ flarg: many }, preview)).toEqual({ flarg: null });
    expect(preview).toHaveBeenCalledTimes(MAX_PREVIEWS);
  });

  it('offers nothing to check when a request fails', async () => {
    const preview = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await pickQuickActions({ flarg: [attack], mazpar: [cast] }, preview)).toEqual({
      flarg: null,
      mazpar: cast,
    });
  });

  it('asks nothing when no candidate needs checking', async () => {
    const preview = vi.fn(async () => ({ revision: 1, accepted: [] }));
    expect(await pickQuickActions({ mazpar: [cast] }, preview)).toEqual({ mazpar: cast });
    expect(preview).not.toHaveBeenCalled();
  });
});
