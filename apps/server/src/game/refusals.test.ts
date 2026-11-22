import { describe, expect, it } from 'vitest';
import type { BattleDeclaration } from '@bxvtt/shared/protocol';
import type { RoundRejection } from './refusals';
import { attributeRefusals } from './refusals';

/** A declaration with the fields the attribution reads. */
function declare(id: string, action: BattleDeclaration['action'], extra: Partial<BattleDeclaration> = {}) {
  return { character_id: id, action, reversed: false, targets: [], ...extra } as BattleDeclaration;
}

/**
 * Simulates osrlib's judgement: each declaration has fixed rejections, which come in declaration order, and
 * the sentinel probe gets `back_stab_not_attack`. Records each probe.
 */
function judge(own: Record<string, RoundRejection[]>) {
  const probes: BattleDeclaration[][] = [];
  const round = (declarations: readonly BattleDeclaration[]) =>
    declarations.flatMap((declaration) =>
      declaration.back_stab === true
        ? [
            {
              code: 'battle.declaration.back_stab_not_attack',
              params: { character: declaration.character_id },
            },
          ]
        : (own[declaration.character_id] ?? []),
    );
  const probe = async (declarations: BattleDeclaration[]) => {
    probes.push(declarations);
    return round(declarations);
  };
  return { round, probe, probes };
}

const reach = (feet: number): RoundRejection => ({
  code: 'combat.attack.out_of_reach',
  params: { distance_feet: feet },
});
const count: RoundRejection = {
  code: 'magic.cast.target_count',
  params: { expected: 1, supplied: 2, mode: 'missiles' },
};

describe('attributeRefusals', () => {
  it('trusts a param that names a declarer, and needs no probe for it', async () => {
    const declarations = [declare('a', 'attack'), declare('b', 'give_item')];
    const sim = judge({
      b: [{ code: 'battle.declaration.member_out_of_reach', params: { character: 'b', target: 'a' } }],
    });
    const refusals = await attributeRefusals(declarations, sim.round(declarations), sim.probe);
    expect(refusals.map((refusal) => refusal.member_id)).toEqual(['b']);
    expect(sim.probes).toEqual([]);
  });

  it('gives a rejection that names nobody to the only declaration that is not a hold', async () => {
    const declarations = [declare('a', 'hold'), declare('b', 'attack'), declare('c', 'hold')];
    const sim = judge({ b: [reach(30)] });
    const refusals = await attributeRefusals(declarations, sim.round(declarations), sim.probe);
    expect(refusals).toEqual([
      { member_id: 'b', code: 'combat.attack.out_of_reach', params: { distance_feet: 30 } },
    ]);
    expect(sim.probes).toEqual([]);
  });

  it('probes with a declaration osrlib always refuses, and never sends the round as a hold', async () => {
    const declarations = [declare('a', 'attack'), declare('b', 'cast'), declare('c', 'attack')];
    const sim = judge({ a: [reach(30)], b: [count], c: [reach(40)] });
    const refusals = await attributeRefusals(declarations, sim.round(declarations), sim.probe);
    expect(refusals.map((refusal) => refusal.member_id)).toEqual(['a', 'b', 'c']);
    for (const probe of sim.probes) {
      expect(probe.filter((declaration) => declaration.back_stab === true)).toHaveLength(1);
      expect(probe.map((declaration) => declaration.character_id)).toEqual(['a', 'b', 'c']);
    }
    expect(sim.probes.length).toBeLessThanOrEqual(2);
  });

  it('tells identical rejections apart by the order of the declarations', async () => {
    const declarations = [declare('a', 'attack'), declare('b', 'attack')];
    const sim = judge({ a: [reach(30)], b: [reach(30)] });
    const refusals = await attributeRefusals(declarations, sim.round(declarations), sim.probe);
    expect(refusals.map((refusal) => refusal.member_id)).toEqual(['a', 'b']);
  });

  it('never probes a declaration that moves, and lists the candidates it could not tell apart', async () => {
    const declarations = [
      declare('a', 'attack', { move: 'close' }),
      declare('b', 'move', { move: 'close' }),
      declare('c', 'hold'),
    ];
    const sim = judge({ a: [reach(10)], b: [reach(20)] });
    const refusals = await attributeRefusals(declarations, sim.round(declarations), sim.probe);
    expect(sim.probes).toEqual([]);
    expect(refusals.map((refusal) => [refusal.member_id, refusal.candidates])).toEqual([
      [null, ['a', 'b']],
      [null, ['a', 'b']],
    ]);
  });

  it('stops probing when a probe changes how the others are judged, or fails', async () => {
    const declarations = [declare('a', 'attack'), declare('b', 'attack')];
    const changed = async () => [{ code: 'battle.declaration.not_in_front_rank', params: {} }];
    const refusals = await attributeRefusals(declarations, [reach(30), count], changed);
    expect(refusals.map((refusal) => refusal.member_id)).toEqual([null, null]);
    const failed = await attributeRefusals(declarations, [reach(30), count], async () => null);
    expect(failed.map((refusal) => refusal.candidates)).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ]);
  });
});
