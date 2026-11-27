import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { TestServer, TestUser } from './helpers';
import { createTable, createUser, startServer } from './helpers';

// Seed 515 rolls STR 16, INT 13, WIS 12, DEX 11, CON 9, CHA 7: the contract's fighter on the scores a trade moves.
const FIGHTER_SEED = 515;
// Seed 1832 rolls STR 15, INT 16, WIS 11, which qualifies for an elf.
const ELF_SEED = 1832;
// Seed 7 rolls INT 6, which doesn't qualify for an elf.
const NO_ELF_SEED = 7;

describe('the ability trade limits', () => {
  let server: TestServer;
  let alice: TestUser;
  let bob: TestUser;
  let tableId: string;

  beforeAll(async () => {
    server = await startServer();
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    tableId = (await createTable(alice, [bob])).id;
    await alice.client.updateTable(tableId, { settings: { ability_score_rerolls: null } });
  });

  afterAll(async () => {
    await server.close();
  });

  it("passes bxapi's limits through for the roll and the class", async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    const limits = await alice.client.getAdjustmentLimits(roll.id, { class_id: 'fighter' });
    expect(limits).toMatchObject({
      lower_step: 2,
      raise_step: 1,
      can_trade: true,
      max_points: 2,
      max_points_reason: { code: 'creation.adjustment.no_room_to_raise', params: { max_points: 2 } },
    });
    expect(limits.abilities.str).toMatchObject({
      can_lower: false,
      can_raise: true,
      lowest: 16,
      highest: 18,
      lowest_reason: { code: 'creation.adjustment.prime_requisite_lowered', params: { ability: 'str' } },
      highest_reason: {
        code: 'creation.adjustment.above_cap',
        params: { ability: 'str', score: 16, amount: 3 },
      },
    });
    expect(limits.abilities.int).toMatchObject({ can_lower: true, lowest: 9, highest: 13 });
    expect(limits.abilities.wis).toMatchObject({ can_lower: true, lowest: 10, highest: 12 });
    expect(Object.keys(limits.abilities).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
    // Reading the limits uses nothing.
    expect((await alice.client.getAbilityRoll(roll.id)).used).toBe(false);
  });

  it('answers for an arcane caster before the first spell is chosen', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: ELF_SEED });
    const limits = await alice.client.getAdjustmentLimits(roll.id, { class_id: 'elf' });
    expect(limits.max_points).toBe(1);
    expect(limits.abilities.str?.highest).toBe(16);
    expect(limits.abilities.int?.highest).toBe(17);
    expect(limits.abilities.wis?.lowest).toBe(9);
  });

  it("returns bxapi's refusal for a class it doesn't know", async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    await expect(alice.client.getAdjustmentLimits(roll.id, { class_id: 'nope' })).rejects.toSatisfy(
      (error) =>
        isProblem(error, 'character_invalid') &&
        error.problem.field === 'class_id' &&
        error.problem.id === 'nope',
    );
  });

  it("returns bxapi's refusal for a class the scores don't qualify for", async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: NO_ELF_SEED });
    await expect(alice.client.getAdjustmentLimits(roll.id, { class_id: 'elf' })).rejects.toSatisfy(
      (error) =>
        isProblem(error, 'character_invalid') &&
        (error.problem.rejections ?? []).some((r) => r.code === 'creation.class.requirements_not_met'),
    );
  });

  it('refuses a missing class, a roll the user does not own, and an older roll', async () => {
    const older = await alice.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    const newer = await alice.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    await expect(alice.client.getAdjustmentLimits(newer.id, { class_id: '' })).rejects.toSatisfy((error) =>
      isProblem(error, 'validation_error'),
    );
    await expect(bob.client.getAdjustmentLimits(newer.id, { class_id: 'fighter' })).rejects.toSatisfy(
      (error) => isProblem(error, 'not_found'),
    );
    await expect(alice.client.getAdjustmentLimits(older.id, { class_id: 'fighter' })).rejects.toSatisfy(
      (error) => isProblem(error, 'ability_roll_superseded') && error.problem.roll_id === newer.id,
    );
  });

  it('refuses another class once the hit points fix one', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    await alice.client.rollHitPoints(roll.id, { class_id: 'fighter' });
    await expect(alice.client.getAdjustmentLimits(roll.id, { class_id: 'cleric' })).rejects.toSatisfy(
      (error) => isProblem(error, 'ability_roll_locked') && error.problem.class_id === 'fighter',
    );
    await expect(alice.client.getAdjustmentLimits(roll.id, { class_id: 'fighter' })).resolves.toMatchObject({
      can_trade: true,
    });
  });
});

describe('the rate limit on the ability trade limits', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ rateLimits: { characterChecks: { capacity: 2, windowMs: 60_000 } } });
  });

  afterAll(async () => {
    await server.close();
  });

  it('counts each read against the limit that character checks use', async () => {
    const alice = await createUser(server, 'Alice');
    const tableId = (await createTable(alice, [])).id;
    const roll = await alice.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    await alice.client.getAdjustmentLimits(roll.id, { class_id: 'fighter' });
    await alice.client.getAdjustmentLimits(roll.id, { class_id: 'fighter' });
    await expect(alice.client.getAdjustmentLimits(roll.id, { class_id: 'fighter' })).rejects.toSatisfy(
      (error) => isProblem(error, 'rate_limited'),
    );
  });

  it('takes nothing from the limit for a roll the user can no longer use', async () => {
    const bob = await createUser(server, 'Bob');
    const tableId = (await createTable(bob, [])).id;
    const older = await bob.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    // With no reroll limit, Bob rolls again, which supersedes the first roll.
    await bob.client.updateTable(tableId, { settings: { ability_score_rerolls: null } });
    const newer = await bob.client.rollAbilities(tableId, { seed: FIGHTER_SEED });
    for (let i = 0; i < 3; i += 1) {
      await expect(bob.client.getAdjustmentLimits(older.id, { class_id: 'fighter' })).rejects.toSatisfy(
        (error) => isProblem(error, 'ability_roll_superseded'),
      );
    }
    await expect(bob.client.getAdjustmentLimits(newer.id, { class_id: 'fighter' })).resolves.toMatchObject({
      can_trade: true,
    });
  });
});
