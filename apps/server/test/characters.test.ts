import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createTable, createUser, recordBxapi, startServer } from './helpers';

describe('characters', () => {
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

  /** Rolls ability scores at the table, and rolls the hit points and the gold for a class. */
  async function rollFor(user: TestUser, seed: number, classId = 'fighter') {
    const roll = await user.client.rollAbilities(tableId, { seed });
    await user.client.rollHitPoints(roll.id, { class_id: classId });
    await user.client.rollStartingGold(roll.id, { class_id: classId });
    return roll;
  }

  afterAll(async () => {
    await server.close();
  });

  it('returns the three dice behind each ability score from both ability roll routes', async () => {
    const posted = await alice.client.rollAbilities(tableId, { seed: 99 });
    expect(posted).toMatchObject({ table_id: tableId, rerolls_left: null });
    const fetched = await alice.client.getAbilityRoll(posted.id);
    for (const roll of [posted, fetched]) {
      expect(Object.keys(roll.rolls.rolls).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
      for (const [ability, score] of Object.entries(roll.scores)) {
        const dice = roll.rolls.rolls[ability];
        expect(dice).toHaveLength(3);
        for (const die of dice ?? []) {
          expect(Number.isInteger(die)).toBe(true);
          expect(die).toBeGreaterThanOrEqual(1);
          expect(die).toBeLessThanOrEqual(6);
        }
        expect((dice ?? []).reduce((sum, die) => sum + die, 0)).toBe(score);
        expect(roll.rolls.scores[ability]).toBe(score);
      }
    }
    // bxapi rolls the same dice again from the roll's seed.
    expect(fetched.rolls).toEqual(posted.rolls);
    await expect(bob.client.getAbilityRoll(posted.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it('rolls abilities and creates a character from the roll', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 99 });
    expect(roll.eligible_class_ids.length).toBeGreaterThan(0);
    expect((await alice.client.getAbilityRoll(roll.id)).used).toBe(false);
    await expect(bob.client.getAbilityRoll(roll.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    const classId = roll.eligible_class_ids.includes('fighter')
      ? 'fighter'
      : (roll.eligible_class_ids[0] ?? 'fighter');
    // Bob can't create a character from Alice's roll.
    await expect(
      bob.client.createCharacter({
        name: 'Thief',
        class_id: classId,
        alignment: 'neutral',
        ability_roll_id: roll.id,
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'not_found'));
    const character = await alice.client.createCharacter({
      name: 'Brenna',
      class_id: classId,
      alignment: 'lawful',
      ability_roll_id: roll.id,
    });
    expect(character.character.scores).toEqual(roll.scores);
    await expect(
      alice.client.createCharacter({
        name: 'Again',
        class_id: classId,
        alignment: 'lawful',
        ability_roll_id: roll.id,
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'ability_roll_used'));
  });

  it('previews a character without storing it', async () => {
    const preview = await alice.client.previewCharacter({
      name: 'Maybe',
      class_id: 'fighter',
      alignment: 'lawful',
      seed: 5,
    });
    expect(preview.character.name).toBe('Maybe');
    expect(preview.seed).toBe(5);
    expect((await alice.client.listCharacters()).items.map((item) => item.name)).not.toContain('Maybe');
  });

  it('never sends bxapi the old top-level re-roll flag with a preview', async () => {
    const recorder = recordBxapi(server);
    try {
      const preview = await alice.client.previewCharacter({
        name: 'Maybe',
        class_id: 'fighter',
        alignment: 'lawful',
        seed: 5,
        hp_reroll_at_first_level: true,
        ruleset: { hp_reroll_at_first_level: true },
      });
      expect(preview.character.name).toBe('Maybe');
      const [sent] = recorder.posts('/v1/generate/character');
      const body = JSON.parse(sent?.body ?? '{}') as Record<string, unknown>;
      expect(body).not.toHaveProperty('hp_reroll_at_first_level');
      expect(body.ruleset).toEqual({ hp_reroll_at_first_level: true });
    } finally {
      recorder.stop();
    }
  });

  it('passes bxapi character_invalid problems through intact', async () => {
    const roll = await rollFor(alice, 7);
    const unknownItem = await alice.client
      .createCharacter({
        name: 'X',
        class_id: 'fighter',
        alignment: 'lawful',
        ability_roll_id: roll.id,
        purchases: [{ item_id: 'nope' }],
      })
      .catch((error: BxvttProblemError) => error);
    expect(isProblem(unknownItem, 'character_invalid')).toBe(true);
    expect((unknownItem as BxvttProblemError).problem).toMatchObject({
      field: 'purchases',
      index: 0,
      id: 'nope',
    });
    const fresh = await alice.client.rollAbilities(tableId, { seed: 8 });
    const unknownClass = await alice.client
      .createCharacter({ name: 'X', class_id: 'wizardz', alignment: 'lawful', ability_roll_id: fresh.id })
      .catch((error: BxvttProblemError) => error);
    expect((unknownClass as BxvttProblemError).problem).toMatchObject({
      code: 'character_invalid',
      field: 'class_id',
    });
    // Plate mail, a shield, and a sword cost more than a low gold roll, so osrlib refuses the purchase.
    const broke = await alice.client
      .previewCharacter({
        name: 'X',
        class_id: 'fighter',
        alignment: 'lawful',
        purchases: [{ item_id: 'plate_mail' }, { item_id: 'plate_mail' }, { item_id: 'plate_mail' }],
        seed: 3,
      })
      .catch((error: BxvttProblemError) => error);
    expect((broke as BxvttProblemError).problem.code).toBe('character_invalid');
    expect((broke as BxvttProblemError).problem.rejections?.[0]?.code).toMatch(/^items\.purchase\./);
    await expect(
      alice.client.createCharacter({
        name: 'X',
        class_id: 'fighter',
        alignment: 'evil' as 'lawful',
        ability_roll_id: fresh.id,
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
  });

  it('refuses a character without an ability roll, so every character follows its table rules', async () => {
    const body = { name: 'Rogue', class_id: 'fighter', alignment: 'lawful', seed: 3 };
    const response = await fetch(`${server.url}/api/characters`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'validation_error',
      errors: [{ path: ['ability_roll_id'] }],
    });
  });

  it('answers a roll from before rolls belonged to tables as one the user does not have', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: 9 });
    // A roll that layout version 8 migrated has no table and no recorded rules.
    server.server.ctx.db.run(
      'UPDATE ability_rolls SET table_id = NULL, rules_json = NULL WHERE id = ?',
      roll.id,
    );
    await expect(alice.client.getAbilityRoll(roll.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await expect(alice.client.rollHitPoints(roll.id, { class_id: 'fighter' })).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it('shows and deletes only your own characters', async () => {
    const mine = await createCharacter(alice, 'Mine');
    const theirs = await createCharacter(bob, 'Theirs');
    const list = await alice.client.listCharacters();
    expect(list.items.map((item) => item.id)).toContain(mine.id);
    expect(list.items.map((item) => item.id)).not.toContain(theirs.id);
    expect((await alice.client.getCharacter(mine.id)).name).toBe('Mine');
    await expect(alice.client.getCharacter(theirs.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await expect(alice.client.deleteCharacter(theirs.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await alice.client.deleteCharacter(mine.id);
    await expect(alice.client.getCharacter(mine.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it('lets a referee read the characters on the roster of their table', async () => {
    const table = await alice.client.createTable({ name: 'Reading' });
    await bob.client.joinTable(table.invite_code);
    const character = await createCharacter(bob, 'Rostered');
    await expect(alice.client.getCharacter(character.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await bob.client.addToRoster(table.id, character.id);
    expect((await alice.client.getCharacter(character.id)).name).toBe('Rostered');
    // Deleting the character takes it off the roster.
    await bob.client.deleteCharacter(character.id);
    expect((await alice.client.getTable(table.id)).roster).toEqual([]);
  });

  it('refuses seeds when the server does not allow them', async () => {
    const strict = await startServer({ allowCharacterSeeds: false });
    try {
      const user = await createUser(strict, 'Strict');
      const table = await user.client.createTable({ name: 'Strict table' });
      await expect(user.client.rollAbilities(table.id, { seed: 1 })).rejects.toSatisfy((error) =>
        isProblem(error, 'forbidden'),
      );
    } finally {
      await strict.close();
    }
  });
});
