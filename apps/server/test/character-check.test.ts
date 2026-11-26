import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { AbilityRoll, CharacterCheckRequest } from '@bxvtt/shared/protocol';
import type { TestServer, TestUser } from './helpers';
import { createTable, createUser, startServer } from './helpers';

/** Counts the server's calls to bxapi, by path. */
function countCalls(server: TestServer): { count: (pattern: RegExp) => number } {
  const bxapi = server.server.ctx.bxapi;
  const original = bxapi.post.bind(bxapi);
  const paths: string[] = [];
  bxapi.post = (async (path: string, body: unknown, options?: Parameters<typeof original>[2]) => {
    paths.push(path);
    return original(path, body, options);
  }) as typeof bxapi.post;
  return { count: (pattern) => paths.filter((path) => pattern.test(path)).length };
}

/** Records the body of each POST the server sends bxapi from now on. */
function countBodies(server: TestServer): { path: string; body: unknown }[] {
  const bxapi = server.server.ctx.bxapi;
  const original = bxapi.post.bind(bxapi);
  const sent: { path: string; body: unknown }[] = [];
  bxapi.post = (async (path: string, body: unknown, options?: Parameters<typeof original>[2]) => {
    sent.push({ path, body });
    return original(path, body, options);
  }) as typeof bxapi.post;
  return sent;
}

describe('the character check', () => {
  let server: TestServer;
  let alice: TestUser;
  let bob: TestUser;
  let roll: AbilityRoll;
  let tableId: string;
  let calls: { count: (pattern: RegExp) => number };

  beforeAll(async () => {
    server = await startServer();
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    tableId = (await createTable(alice, [bob])).id;
    await alice.client.updateTable(tableId, { settings: { ability_score_rerolls: null } });
    calls = countCalls(server);
    // Seed 5 qualifies for a fighter and gives 110 gp.
    roll = await alice.client.rollAbilities(tableId, { seed: 5 });
    expect(roll.eligible_class_ids).toContain('fighter');
  });

  afterAll(async () => {
    await server.close();
  });

  const body = (extra: Partial<CharacterCheckRequest> = {}): CharacterCheckRequest => ({
    name: 'Brenna',
    class_id: 'fighter',
    alignment: 'lawful',
    ability_roll_id: roll.id,
    ...extra,
  });

  it('checks choices with one preview, without storing a character or using the roll', async () => {
    const previews = calls.count(/\/preview$/);
    const check = await alice.client.checkCharacter(body());
    expect(check).toEqual({ valid: true, problem: null });
    expect(calls.count(/\/preview$/) - previews).toBe(1);
    expect(calls.count(/^\/v1\/characters$/)).toBe(0);
    expect((await alice.client.getAbilityRoll(roll.id)).used).toBe(false);
    expect((await alice.client.listCharacters()).items).toEqual([]);
  });

  it('refuses purchases and equipped items until the gold is rolled', async () => {
    await expect(alice.client.checkCharacter(body({ purchases: [{ item_id: 'torch' }] }))).rejects.toSatisfy(
      (error) => isProblem(error, 'gold_not_rolled'),
    );
    await expect(alice.client.checkCharacter(body({ equip_item_ids: ['sword'] }))).rejects.toSatisfy(
      (error) => isProblem(error, 'gold_not_rolled'),
    );
    await alice.client.rollHitPoints(roll.id, { class_id: 'fighter' });
    await expect(alice.client.checkCharacter(body({ purchases: [{ item_id: 'torch' }] }))).rejects.toSatisfy(
      (error) => isProblem(error, 'gold_not_rolled'),
    );
    await alice.client.rollStartingGold(roll.id, { class_id: 'fighter' });
    await expect(alice.client.checkCharacter(body({ purchases: [{ item_id: 'torch' }] }))).resolves.toEqual({
      valid: true,
      problem: null,
    });
  });

  it("returns bxapi's problem with its members, and never the hit points or the gold", async () => {
    const before = alice.received.length;
    const tooDear = await alice.client.checkCharacter(
      body({ purchases: [{ item_id: 'plate_mail', quantity: 4 }] }),
    );
    expect(Object.keys(tooDear).sort()).toEqual(['problem', 'valid']);
    expect(tooDear.valid).toBe(false);
    expect(tooDear.problem).toMatchObject({ code: 'character_invalid', status: 422 });
    expect(tooDear.problem?.rejections?.[0]?.code).toBe('items.purchase.insufficient_funds');

    const unknown = await alice.client.checkCharacter(body({ purchases: [{ item_id: 'nope' }] }));
    expect(unknown.problem).toMatchObject({ field: 'purchases', index: 0, id: 'nope' });

    const unbought = await alice.client.checkCharacter(body({ equip_item_ids: ['sword'] }));
    expect(unbought.problem).toMatchObject({ field: 'equip_item_ids', index: 0, id: 'sword' });

    const valid = await alice.client.checkCharacter(body({ purchases: [{ item_id: 'sword' }] }));
    expect(Object.keys(valid).sort()).toEqual(['problem', 'valid']);
    // Nothing in the answers carries the previewed character or its dice.
    for (const text of alice.received.slice(before)) {
      expect(text).not.toMatch(/hit_point|gold_roll|max_hp|purse|"rolls"|"character"|"derived"/);
    }
    expect((await alice.client.getAbilityRoll(roll.id)).used).toBe(false);
  });

  it('refuses a class other than the one the hit points were rolled for', async () => {
    const other = roll.eligible_class_ids.find((id) => id !== 'fighter') ?? 'cleric';
    await expect(alice.client.checkCharacter(body({ class_id: other }))).rejects.toSatisfy(
      (error) => isProblem(error, 'ability_roll_locked') && error.problem.class_id === 'fighter',
    );
  });

  it('checks with the ruleset recorded on the roll, whatever rule the body names', async () => {
    const recorder = countBodies(server);
    await alice.client.checkCharacter(
      body({ hp_reroll_at_first_level: false, ruleset: { encumbrance: 'none' } }),
    );
    const sent = recorder.find((call) => call.path.endsWith('/preview'));
    expect(sent?.body).toMatchObject({ ruleset: { hp_reroll_at_first_level: true, encumbrance: 'basic' } });
    expect(sent?.body).not.toHaveProperty('hp_reroll_at_first_level');
  });

  it('checks any eligible class before the hit points are rolled', async () => {
    const fresh = await alice.client.rollAbilities(tableId, { seed: 9 });
    const ineligible = ['magic_user', 'cleric', 'fighter', 'thief', 'dwarf', 'elf', 'halfling'].find(
      (id) => !fresh.eligible_class_ids.includes(id),
    );
    if (ineligible !== undefined) {
      const wrongClass = await alice.client.checkCharacter({
        ...body(),
        ability_roll_id: fresh.id,
        class_id: ineligible,
      });
      expect(wrongClass.valid).toBe(false);
      expect(wrongClass.problem?.rejections?.[0]?.code).toMatch(/^creation\.class\./);
    }
    // The new roll supersedes the first one.
    await expect(alice.client.checkCharacter(body())).rejects.toSatisfy(
      (error) => isProblem(error, 'ability_roll_superseded') && error.problem.roll_id === fresh.id,
    );
    for (const classId of fresh.eligible_class_ids.slice(0, 2)) {
      const check = await alice.client.checkCharacter({
        ...body(),
        ability_roll_id: fresh.id,
        class_id: classId,
        starting_spell_ids: classId === 'magic_user' || classId === 'elf' ? ['sleep'] : undefined,
      });
      expect(check).toEqual({ valid: true, problem: null });
    }
  });

  it("refuses another user's roll and a used roll", async () => {
    await expect(bob.client.checkCharacter(body())).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    const used = await alice.client.rollAbilities(tableId, { seed: 99 });
    const usedClass = used.eligible_class_ids[0] ?? 'fighter';
    await alice.client.createCharacter({
      name: 'Done',
      class_id: usedClass,
      alignment: 'lawful',
      ability_roll_id: used.id,
    });
    await expect(
      alice.client.checkCharacter({
        name: 'Again',
        class_id: usedClass,
        alignment: 'lawful',
        ability_roll_id: used.id,
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'ability_roll_used'));
  });

  it('needs an ability roll', async () => {
    await expect(
      alice.client.checkCharacter({ name: 'X', class_id: 'fighter', alignment: 'lawful' } as never),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
  });
});

describe('the character check rate limit', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ rateLimits: { characterChecks: { capacity: 2, windowMs: 60_000 } } });
  });

  afterAll(async () => {
    await server.close();
  });

  it('limits how fast one user checks characters and rolls hit points', async () => {
    const alice = await createUser(server, 'Alice');
    const table = await alice.client.createTable({ name: 'Limits' });
    const roll = await alice.client.rollAbilities(table.id, { seed: 5 });
    const request: CharacterCheckRequest = {
      name: 'X',
      class_id: roll.eligible_class_ids[0] ?? 'fighter',
      alignment: 'lawful',
      ability_roll_id: roll.id,
    };
    await alice.client.checkCharacter(request);
    await alice.client.checkCharacter(request);
    await expect(alice.client.checkCharacter(request)).rejects.toSatisfy((error) =>
      isProblem(error, 'rate_limited'),
    );
    await expect(alice.client.rollHitPoints(roll.id, { class_id: request.class_id })).rejects.toSatisfy(
      (error) => isProblem(error, 'rate_limited'),
    );
  });
});
