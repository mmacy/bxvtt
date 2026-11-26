import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { StartingRolls } from '@bxvtt/shared/protocol';
import type { TestServer, TestUser } from './helpers';
import { createTable, createUser, startServer } from './helpers';

/** The gold pieces in a stored character's purse. */
function purseGold(inventory: unknown): number | undefined {
  return (inventory as { purse?: { gp?: number } } | null)?.purse?.gp;
}

describe('starting rolls', () => {
  let server: TestServer;
  let alice: TestUser;
  let bob: TestUser;
  let tableId: string;

  beforeAll(async () => {
    server = await startServer();
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    tableId = (await createTable(alice, [bob])).id;
    // These tests roll many times, so the table allows any number of rerolls.
    await alice.client.updateTable(tableId, { settings: { ability_score_rerolls: null } });
  });

  afterAll(async () => {
    await server.close();
  });

  it("rolls hit points and then gold that creation then stores, under the table's first-level reroll", async () => {
    // With seed 24, a fighter's first hit die is a 1. The table's standard ruleset has the reroll on, so it sets
    // the die aside.
    const roll = await alice.client.rollAbilities(tableId, { seed: 24 });
    const choices = { class_id: 'fighter' };
    const rules = {
      ability_score_method: '3d6',
      hp_reroll_at_first_level: true,
      max_hp_at_first_level: false,
      ability_score_rerolls: null,
      sub_par_restart: false,
    };
    expect(await alice.client.getStartingRolls(roll.id)).toEqual({
      used: false,
      class_id: null,
      rules,
      gold_rolled: false,
    });

    const hp = await alice.client.rollHitPoints(roll.id, choices);
    expect(hp).toMatchObject({ class_id: 'fighter', rules, gold_roll: null });
    const dice = hp.hit_point_roll.rolls;
    expect(dice.length).toBeGreaterThan(1);
    for (const setAside of dice.slice(0, -1)) expect(setAside).toBeLessThanOrEqual(2);
    expect(await alice.client.getStartingRolls(roll.id)).toEqual({
      used: false,
      class_id: 'fighter',
      rules,
      gold_rolled: false,
    });

    const gold = await alice.client.rollStartingGold(roll.id, choices);
    expect(gold.hit_point_roll).toEqual(hp.hit_point_roll);
    expect(gold.gold_roll?.rolls).toHaveLength(3);
    expect(gold.gold_roll?.multiplier).toBe(10);
    expect((await alice.client.getStartingRolls(roll.id)).gold_rolled).toBe(true);

    // The adjustment, the identity, and the purchases change neither roll.
    const character = await alice.client.createCharacter({
      name: 'Wren',
      alignment: 'chaotic',
      ability_roll_id: roll.id,
      purchases: [{ item_id: 'sword' }],
      ...choices,
    });
    expect(character.character.max_hp).toBe(hp.hit_point_roll.hit_points);
    expect(purseGold(character.character.inventory)).toBe((gold.gold_roll?.total ?? 0) - 10);
    expect((await alice.client.getStartingRolls(roll.id)).used).toBe(true);
    await expect(alice.client.rollHitPoints(roll.id, choices)).rejects.toSatisfy((error) =>
      isProblem(error, 'ability_roll_used'),
    );
  });

  it('returns the same dice for a second request', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 5 });
    const first = await alice.client.rollHitPoints(roll.id, { class_id: 'fighter' });
    expect(await alice.client.rollHitPoints(roll.id, { class_id: 'fighter' })).toEqual(first);
    const gold = await alice.client.rollStartingGold(roll.id, { class_id: 'fighter' });
    expect(await alice.client.rollStartingGold(roll.id, { class_id: 'fighter' })).toEqual(gold);
    // After the gold, reading the hit points again returns both rolls, as a reload needs.
    expect(await alice.client.rollHitPoints(roll.id, { class_id: 'fighter' })).toEqual(gold);
  });

  it('rolls the gold only after the hit points', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 5 });
    await expect(alice.client.rollStartingGold(roll.id, { class_id: 'fighter' })).rejects.toSatisfy((error) =>
      isProblem(error, 'hit_points_not_rolled'),
    );
    expect((await alice.client.getStartingRolls(roll.id)).gold_rolled).toBe(false);
  });

  it('fixes the class once the hit points are rolled', async () => {
    // Seed 4 qualifies for a fighter and a cleric.
    const roll = await alice.client.rollAbilities(tableId, { seed: 4 });
    expect(roll.eligible_class_ids).toEqual(expect.arrayContaining(['fighter', 'cleric']));
    await alice.client.rollHitPoints(roll.id, { class_id: 'cleric' });
    const locked = (error: unknown) =>
      isProblem(error, 'ability_roll_locked') && error.problem.class_id === 'cleric';
    await expect(alice.client.rollHitPoints(roll.id, { class_id: 'fighter' })).rejects.toSatisfy(locked);
    await expect(alice.client.rollStartingGold(roll.id, { class_id: 'fighter' })).rejects.toSatisfy(locked);
    await expect(
      alice.client.checkCharacter({
        name: 'Osric',
        alignment: 'lawful',
        class_id: 'fighter',
        ability_roll_id: roll.id,
      }),
    ).rejects.toSatisfy(locked);
    // Creation keeps the fixed choices too, and leaves the roll unused when it refuses.
    await expect(
      alice.client.createCharacter({
        name: 'Osric',
        alignment: 'lawful',
        class_id: 'fighter',
        ability_roll_id: roll.id,
      }),
    ).rejects.toSatisfy(locked);
    expect((await alice.client.getStartingRolls(roll.id)).used).toBe(false);
    const osric = await alice.client.createCharacter({
      name: 'Osric',
      alignment: 'lawful',
      class_id: 'cleric',
      ability_roll_id: roll.id,
    });
    expect(osric.class_id).toBe('cleric');
  });

  it('refuses purchases at creation until the gold is rolled, and creates without starting rolls', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 5 });
    const choices = {
      name: 'Brenna',
      alignment: 'lawful' as const,
      class_id: 'fighter',
      ability_roll_id: roll.id,
    };
    await expect(
      alice.client.createCharacter({ ...choices, purchases: [{ item_id: 'plate_mail', quantity: 4 }] }),
    ).rejects.toSatisfy((error) => isProblem(error, 'gold_not_rolled'));
    // Creating from the roll in one request, with no purchases, needs no starting rolls.
    const brenna = await alice.client.createCharacter(choices);
    expect(brenna.class_id).toBe('fighter');
  });

  it('needs the first spell of an arcane caster before it rolls', async () => {
    // Seed 9 qualifies for a magic-user.
    const roll = await alice.client.rollAbilities(tableId, { seed: 9 });
    const refused = await alice.client
      .rollHitPoints(roll.id, { class_id: 'magic_user' })
      .catch((error: unknown) => error);
    expect(isProblem(refused, 'character_invalid')).toBe(true);
    // A refused roll fixes nothing.
    expect((await alice.client.getStartingRolls(roll.id)).class_id).toBeNull();
    const rolled = await alice.client.rollHitPoints(roll.id, {
      class_id: 'magic_user',
      starting_spell_ids: ['sleep'],
    });
    // The spell doesn't change the dice.
    expect(
      await alice.client.rollHitPoints(roll.id, {
        class_id: 'magic_user',
        starting_spell_ids: ['magic_missile'],
      }),
    ).toEqual(rolled);
  });

  it("acts only on the user's own ability roll", async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 5 });
    const notFound = (error: unknown) => isProblem(error, 'not_found');
    await expect(bob.client.getStartingRolls(roll.id)).rejects.toSatisfy(notFound);
    await expect(bob.client.rollHitPoints(roll.id, { class_id: 'fighter' })).rejects.toSatisfy(notFound);
    await alice.client.rollHitPoints(roll.id, { class_id: 'fighter' });
    await expect(bob.client.rollHitPoints(roll.id, { class_id: 'fighter' })).rejects.toSatisfy(notFound);
    await expect(bob.client.rollStartingGold(roll.id, { class_id: 'fighter' })).rejects.toSatisfy(notFound);
    expect((await alice.client.getStartingRolls(roll.id)).gold_rolled).toBe(false);
  });

  it('fixes one class when two requests arrive together', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 4 });
    const results = await Promise.allSettled([
      alice.client.rollHitPoints(roll.id, { class_id: 'fighter' }),
      alice.client.rollHitPoints(roll.id, { class_id: 'cleric' }),
    ]);
    const won = results.filter(
      (result): result is PromiseFulfilledResult<StartingRolls> => result.status === 'fulfilled',
    );
    const lost = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(isProblem(lost[0]?.reason, 'ability_roll_locked')).toBe(true);
    const winner = won[0]?.value.class_id;
    expect((await alice.client.getStartingRolls(roll.id)).class_id).toBe(winner);

    // Two requests with the same choices, such as a double click, both get the same dice.
    const twin = await alice.client.rollAbilities(tableId, { seed: 4 });
    const [a, b] = await Promise.all([
      alice.client.rollHitPoints(twin.id, { class_id: 'fighter' }),
      alice.client.rollHitPoints(twin.id, { class_id: 'fighter' }),
    ]);
    expect(a).toEqual(b);
  });

  it('accepts only the choices the rolls depend on', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 5 });
    await expect(
      alice.client.rollHitPoints(roll.id, { class_id: 'fighter', name: 'Wren' } as never),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
  });
});
