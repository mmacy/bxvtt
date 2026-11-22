import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createUser, startServer } from './helpers';

describe('characters', () => {
  let server: TestServer;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    server = await startServer();
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
  });

  afterAll(async () => {
    await server.close();
  });

  it('rolls abilities and creates a character from the roll', async () => {
    const roll = await alice.client.rollAbilities({ seed: 99 });
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

  it('passes bxapi character_invalid problems through intact', async () => {
    const unknownItem = await alice.client
      .createCharacter({
        name: 'X',
        class_id: 'fighter',
        alignment: 'lawful',
        purchases: [{ item_id: 'nope' }],
      })
      .catch((error: BxvttProblemError) => error);
    expect(isProblem(unknownItem, 'character_invalid')).toBe(true);
    expect((unknownItem as BxvttProblemError).problem).toMatchObject({
      field: 'purchases',
      index: 0,
      id: 'nope',
    });
    const unknownClass = await alice.client
      .createCharacter({ name: 'X', class_id: 'wizardz', alignment: 'lawful' })
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
      alice.client.createCharacter({ name: 'X', class_id: 'fighter', alignment: 'evil' as 'lawful' }),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
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
      await expect(user.client.rollAbilities({ seed: 1 })).rejects.toSatisfy((error) =>
        isProblem(error, 'forbidden'),
      );
      await expect(
        user.client.createCharacter({ name: 'S', class_id: 'fighter', alignment: 'lawful', seed: 1 }),
      ).rejects.toSatisfy((error) => isProblem(error, 'forbidden'));
    } finally {
      await strict.close();
    }
  });
});
