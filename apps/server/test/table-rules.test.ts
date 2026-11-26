import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { CreationRules, Ruleset } from '@bxvtt/shared/protocol';
import openapi from '../../../packages/shared/src/bxapi/openapi.json' with { type: 'json' };
import { findRepoRoot } from '../src/config';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createTable, createUser, recordBxapi, startServer } from './helpers';

/** osrlib's defaults, read here straight from the `default` of each property of bxapi's OpenAPI `Ruleset`. */
const OSRLIB_DEFAULTS = Object.fromEntries(
  Object.entries(openapi.components.schemas.Ruleset.properties).map(([name, property]) => [
    name,
    (property as { default: unknown }).default,
  ]),
);

/** The rules a roll records under the `standard` starting ruleset and the table defaults. */
const STANDARD_RULES: CreationRules = {
  ability_score_method: '3d6',
  hp_reroll_at_first_level: true,
  max_hp_at_first_level: false,
  ability_score_rerolls: 0,
  sub_par_restart: false,
};

/** Seed 6 rolls sub-par scores with 3d6: STR 4 and INT 5. */
const SUB_PAR_SEED = 6;
/** Seed 24 gives a fighter a first hit die of 1. */
const LOW_HIT_DIE_SEED = 24;

describe('the table ruleset', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let tableId: string;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    outsider = await createUser(server, 'Otto');
    tableId = (await createTable(referee, [alice])).id;
  });

  afterAll(async () => {
    await server.close();
  });

  it('serves the two starting rulesets to any signed-in user', async () => {
    const { items } = await alice.client.listRulesets();
    expect(items.map((item) => item.id)).toEqual(['standard', 'creation_house_rules']);
    const [standard, house] = items;
    expect(standard?.ruleset).toEqual({ ...OSRLIB_DEFAULTS, hp_reroll_at_first_level: true });
    const example = JSON.parse(
      await readFile(join(findRepoRoot(), 'apps/server/rulesets/creation_house_rules.json'), 'utf8'),
    ) as Ruleset;
    expect(example).toMatchObject({ ability_score_method: '4d6_drop_lowest', max_hp_at_first_level: true });
    expect(house?.ruleset).toEqual({ ...example, hp_reroll_at_first_level: true });
    const anonymous = await fetch(`${server.url}/api/rulesets`);
    expect(anonymous.status).toBe(401);
  });

  it('gives a new table the standard ruleset, no rerolls, and no sub-par restart', async () => {
    const table = await referee.client.getTable(tableId);
    const { items } = await referee.client.listRulesets();
    expect(table.settings).toMatchObject({
      ruleset: items[0]?.ruleset,
      ability_score_rerolls: 0,
      sub_par_restart: false,
    });
    // Every member reads the same settings.
    expect((await alice.client.getTable(tableId)).settings).toEqual(table.settings);
  });

  it('lets only a referee change the rules, and merges a partial ruleset into the stored one', async () => {
    await expect(
      alice.client.updateTable(tableId, { settings: { ability_score_rerolls: null } }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_required'));
    await expect(
      alice.client.updateTable(tableId, { settings: { ruleset: { encumbrance: 'none' } } }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_required'));

    const before = (await referee.client.getTable(tableId)).settings.ruleset;
    const after = await referee.client.updateTable(tableId, {
      settings: { ruleset: { encumbrance: 'none', thac0_arithmetic: true }, sub_par_restart: true },
    });
    expect(after.settings.ruleset).toEqual({ ...before, encumbrance: 'none', thac0_arithmetic: true });
    expect(after.settings.sub_par_restart).toBe(true);
    await referee.client.updateTable(tableId, {
      settings: { ruleset: before, sub_par_restart: false },
    });
  });

  it("refuses a rule bxapi's Ruleset schema doesn't have, or a value it doesn't allow", async () => {
    const send = (settings: unknown) =>
      fetch(`${server.url}/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${referee.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
    for (const [settings, path] of [
      [{ ruleset: { critical_hits: true } }, ['settings', 'ruleset', 'critical_hits']],
      [{ ruleset: { encumbrance: 'heavy' } }, ['settings', 'ruleset', 'encumbrance']],
      [{ ruleset: { ability_score_method: '5d6' } }, ['settings', 'ruleset', 'ability_score_method']],
      [{ ruleset: { thac0_arithmetic: 'yes' } }, ['settings', 'ruleset', 'thac0_arithmetic']],
      [{ ability_score_rerolls: 100 }, ['settings', 'ability_score_rerolls']],
      [{ ability_score_rerolls: 1.5 }, ['settings', 'ability_score_rerolls']],
    ] as const) {
      const response = await send(settings);
      expect(response.status, JSON.stringify(settings)).toBe(422);
      const problem = (await response.json()) as { code: string; errors: { path: unknown[] }[] };
      expect(problem.code).toBe('validation_error');
      expect(problem.errors.map((error) => error.path)).toContainEqual(path);
    }
  });

  it('refuses a roll at a table the user is not a member of', async () => {
    await expect(outsider.client.rollAbilities(tableId, { seed: 1 })).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it('allows one roll with no rerolls, and a new roll once a character is made', async () => {
    const first = await alice.client.rollAbilities(tableId, { seed: 5 });
    expect(first).toMatchObject({ table_id: tableId, rules: STANDARD_RULES, rerolls_left: 0 });
    const refused = await alice.client.rollAbilities(tableId, { seed: 7 }).catch((error: unknown) => error);
    expect(isProblem(refused, 'ability_rerolls_used')).toBe(true);
    expect(isProblem(refused) && refused.problem).toMatchObject({
      ability_score_rerolls: 0,
      roll_id: first.id,
    });
    // A wizard that lost its draft gets back to the open roll.
    expect(await alice.client.getCurrentAbilityRoll(tableId)).toEqual(first);
    // The limit is per player: the referee still has a roll.
    await referee.client.rollAbilities(tableId, { seed: 8 });

    await alice.client.rollHitPoints(first.id, { class_id: 'fighter' });
    await alice.client.createCharacter({
      name: 'Brenna',
      class_id: 'fighter',
      alignment: 'lawful',
      ability_roll_id: first.id,
    });
    expect(await alice.client.getCurrentAbilityRoll(tableId)).toBeNull();
    await expect(outsider.client.getCurrentAbilityRoll(tableId)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    const next = await alice.client.rollAbilities(tableId, { seed: 9 });
    expect(next.rerolls_left).toBe(0);
    expect((await alice.client.getCurrentAbilityRoll(tableId))?.id).toBe(next.id);
  });

  it('counts rerolls against the current limit, closes the rest at creation, and allows any number when unlimited', async () => {
    const table = await referee.client.createTable({ name: 'Rerolls' });
    await alice.client.joinTable(table.invite_code);
    await referee.client.updateTable(table.id, { settings: { ability_score_rerolls: 2 } });
    const rolls = [];
    for (const seed of [11, 12, 13]) rolls.push(await alice.client.rollAbilities(table.id, { seed }));
    expect(rolls.map((roll) => roll.rerolls_left)).toEqual([2, 1, 0]);
    await expect(alice.client.rollAbilities(table.id, { seed: 14 })).rejects.toSatisfy((error) =>
      isProblem(error, 'ability_rerolls_used'),
    );
    // The limit read is the table's current one.
    await referee.client.updateTable(table.id, { settings: { ability_score_rerolls: 3 } });
    const fourth = await alice.client.rollAbilities(table.id, { seed: 14 });
    expect(fourth.rerolls_left).toBe(0);

    // Only the newest roll counts.
    const [oldest] = rolls;
    const superseded = (error: unknown) =>
      isProblem(error, 'ability_roll_superseded') && error.problem.roll_id === fourth.id;
    const choices = {
      name: 'Old',
      alignment: 'lawful' as const,
      class_id: oldest?.eligible_class_ids[0] ?? '',
    };
    await expect(
      alice.client.createCharacter({ ...choices, ability_roll_id: oldest?.id ?? '' }),
    ).rejects.toSatisfy(superseded);
    await expect(
      alice.client.rollHitPoints(oldest?.id ?? '', { class_id: choices.class_id }),
    ).rejects.toSatisfy(superseded);

    // A character from the newest roll closes the others, so the player starts over with one roll.
    await alice.client.createCharacter({
      name: 'Newest',
      alignment: 'lawful',
      class_id: fourth.eligible_class_ids[0] ?? '',
      ability_roll_id: fourth.id,
    });
    await expect(
      alice.client.createCharacter({ ...choices, ability_roll_id: oldest?.id ?? '' }),
    ).rejects.toSatisfy((error) => isProblem(error, 'ability_roll_used'));
    expect((await alice.client.getAbilityRoll(fourth.id)).rerolls_left).toBe(4);

    await referee.client.updateTable(table.id, { settings: { ability_score_rerolls: null } });
    for (let seed = 20; seed < 26; seed += 1) {
      expect((await alice.client.rollAbilities(table.id, { seed })).rerolls_left).toBeNull();
    }
  });

  it('reports a roll a character closed, and the roll it was made from, as used', async () => {
    const table = await referee.client.createTable({ name: 'Closed rolls' });
    await alice.client.joinTable(table.invite_code);
    await referee.client.updateTable(table.id, { settings: { ability_score_rerolls: 1 } });
    const older = await alice.client.rollAbilities(table.id, { seed: 31 });
    const newer = await alice.client.rollAbilities(table.id, { seed: 32 });
    expect((await alice.client.getStartingRolls(older.id)).used).toBe(false);
    await alice.client.createCharacter({
      name: 'Closer',
      alignment: 'lawful',
      class_id: newer.eligible_class_ids[0] ?? '',
      ability_roll_id: newer.id,
    });
    // bxapi never saw the older roll make a character, but the server closed it.
    expect((await alice.client.getStartingRolls(older.id)).used).toBe(true);
    expect((await alice.client.getStartingRolls(newer.id)).used).toBe(true);
  });

  it('admits one of several rolls sent at once when the table allows no rerolls', async () => {
    const table = await referee.client.createTable({ name: 'At once' });
    await alice.client.joinTable(table.invite_code);
    const results = await Promise.allSettled(
      [31, 32, 33, 34].map((seed) => alice.client.rollAbilities(table.id, { seed })),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') expect(isProblem(result.reason, 'ability_rerolls_used')).toBe(true);
    }
  });

  it('closes a roll that bxapi used without the server hearing back, so the player can roll again', async () => {
    const table = await referee.client.createTable({ name: 'Lost answer' });
    await alice.client.joinTable(table.invite_code);
    const roll = await alice.client.rollAbilities(table.id, { seed: 5 });
    const choices = { name: 'Lost', class_id: 'fighter', alignment: 'lawful' as const };
    // bxapi creates the character, as it does when the server times out before the answer comes back.
    await server.server.ctx.bxapi.post('/v1/characters', { ...choices, ability_roll_id: roll.id });
    await expect(alice.client.createCharacter({ ...choices, ability_roll_id: roll.id })).rejects.toSatisfy(
      (error) => isProblem(error, 'ability_roll_used'),
    );
    const next = await alice.client.rollAbilities(table.id, { seed: 6 });
    expect(next.rerolls_left).toBe(0);
    await expect(alice.client.rollHitPoints(roll.id, { class_id: 'fighter' })).rejects.toSatisfy((error) =>
      isProblem(error, 'ability_roll_used'),
    );

    // A preview that finds the roll used closes it too.
    await server.server.ctx.bxapi.post('/v1/characters', { ...choices, ability_roll_id: next.id });
    await expect(alice.client.rollHitPoints(next.id, { class_id: 'fighter' })).rejects.toSatisfy((error) =>
      isProblem(error, 'ability_roll_used'),
    );
    expect((await alice.client.rollAbilities(table.id, { seed: 7 })).table_id).toBe(table.id);
  });

  it('keeps the rules recorded on a roll after the referee changes the table rules', async () => {
    const table = await referee.client.createTable({ name: 'Recorded' });
    await alice.client.joinTable(table.invite_code);
    const roll = await alice.client.rollAbilities(table.id, { seed: LOW_HIT_DIE_SEED });
    expect(roll.ability_score_method).toBe('3d6');
    const { items } = await referee.client.listRulesets();
    const house = items.find((item) => item.id === 'creation_house_rules')?.ruleset;
    await referee.client.updateTable(table.id, {
      settings: { ruleset: { ...house, hp_reroll_at_first_level: false }, ability_score_rerolls: 5 },
    });

    const recorder = recordBxapi(server);
    try {
      const hp = await alice.client.rollHitPoints(roll.id, { class_id: 'fighter' });
      expect(hp.rules).toEqual(STANDARD_RULES);
      // The first die was a 1, which the recorded re-roll set aside, and no maximum applied.
      expect(hp.hit_point_roll.rolls.length).toBeGreaterThan(1);
      expect(hp.hit_point_roll.maximized).toBe(false);
      const character = await alice.client.createCharacter({
        name: 'Wren',
        class_id: 'fighter',
        alignment: 'lawful',
        ability_roll_id: roll.id,
        hp_reroll_at_first_level: false,
        ruleset: { max_hp_at_first_level: true },
      });
      expect(character.character.max_hp).toBe(hp.hit_point_roll.hit_points);
      // bxapi got the recorded ruleset every time, and never the old re-roll flag.
      const sent = recorder.calls
        .filter(
          (call) =>
            call.method === 'POST' && /\/v1\/(ability-rolls\/.+\/preview|characters)$/.test(call.path),
        )
        .map((call) => JSON.parse(call.body ?? '{}') as Record<string, unknown>);
      expect(sent.length).toBeGreaterThanOrEqual(2);
      for (const body of sent) {
        expect(body).not.toHaveProperty('hp_reroll_at_first_level');
        expect(body.ruleset).toMatchObject({ hp_reroll_at_first_level: true, max_hp_at_first_level: false });
      }
      await alice.client.addToRoster(table.id, character.id);
      const [entry] = (await referee.client.getTable(table.id)).roster;
      expect(entry?.creation_rules).toEqual(STANDARD_RULES);
    } finally {
      recorder.stop();
    }

    // A new roll follows the new rules: 4d6 drop lowest and maximum hit points.
    const fresh = await alice.client.rollAbilities(table.id, { seed: LOW_HIT_DIE_SEED });
    expect(fresh.rules).toEqual({
      ability_score_method: '4d6_drop_lowest',
      hp_reroll_at_first_level: false,
      max_hp_at_first_level: true,
      ability_score_rerolls: 5,
      sub_par_restart: false,
    });
    expect(fresh.ability_score_method).toBe('4d6_drop_lowest');
    expect(Object.keys(fresh.rolls.dropped).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
    const classId = fresh.eligible_class_ids.includes('fighter')
      ? 'fighter'
      : (fresh.eligible_class_ids[0] ?? '');
    const hp = await alice.client.rollHitPoints(fresh.id, { class_id: classId });
    expect(hp.hit_point_roll.maximized).toBe(true);
  });

  it('marks a character from before the recorded rules with no creation rules', async () => {
    const table = await referee.client.createTable({ name: 'Old roster' });
    await alice.client.joinTable(table.invite_code);
    const character = await createCharacter(alice, 'Elder', 'fighter', 3, table.id);
    server.server.ctx.db.run('UPDATE characters SET creation_rules_json = NULL WHERE id = ?', character.id);
    await alice.client.addToRoster(table.id, character.id);
    expect((await referee.client.getTable(table.id)).roster[0]?.creation_rules).toBeNull();
  });

  it('says whether a roster character was rolled at another table', async () => {
    const home = await referee.client.createTable({ name: 'Home table' });
    const away = await referee.client.createTable({ name: 'Away table' });
    await alice.client.joinTable(home.invite_code);
    await alice.client.joinTable(away.invite_code);
    const local = await createCharacter(alice, 'Local', 'fighter', 3, home.id);
    const visitor = await createCharacter(alice, 'Visitor', 'fighter', 4, away.id);
    await alice.client.addToRoster(home.id, local.id);
    await alice.client.addToRoster(home.id, visitor.id);
    const roster = (await referee.client.getTable(home.id)).roster;
    expect(roster.map((entry) => [entry.name, entry.rolled_at_other_table])).toEqual([
      ['Local', false],
      ['Visitor', true],
    ]);
  });

  it('starts the game with the table ruleset', async () => {
    const table = await referee.client.createTable({ name: 'Game rules' });
    await alice.client.joinTable(table.invite_code);
    const updated = await referee.client.updateTable(table.id, {
      settings: { ruleset: { individual_initiative: true, xp_award_timing: 'immediate' } },
    });
    const character = await createCharacter(alice, 'Brenna', 'fighter', 11, table.id);
    await alice.client.addToRoster(table.id, character.id);
    const recorder = recordBxapi(server);
    try {
      await referee.client.startGame(table.id, { adventure_id: 'builtin-barrow', seed: 7 });
      const start = recorder.posts('/v1/sessions')[0];
      expect(JSON.parse(start?.body ?? '{}')).toMatchObject({ ruleset: updated.settings.ruleset });
    } finally {
      recorder.stop();
    }
    // A member can still roll during the game.
    const roll = await alice.client.rollAbilities(table.id, { seed: 2 });
    expect(roll.table_id).toBe(table.id);
    // A start request that names a ruleset is refused: the table's settings are the only place for rules.
    const response = await fetch(`${server.url}/api/tables/${table.id}/game`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${referee.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ adventure_id: 'builtin-barrow', ruleset: {} }),
    });
    expect(response.status).toBe(422);
  });
});

describe('the sub-par restart', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
  });

  afterAll(async () => {
    await server.close();
  });

  it('counts a sub-par roll against the limit when the table has no sub-par restart', async () => {
    const roll = await alice.client.rollAbilities(tableId, { seed: SUB_PAR_SEED });
    expect(roll.rolls.sub_par).toBe(true);
    expect(roll.rules.sub_par_restart).toBe(false);
    await expect(alice.client.rollAbilities(tableId, { seed: 5 })).rejects.toSatisfy((error) =>
      isProblem(error, 'ability_rerolls_used'),
    );
  });

  it('discards a sub-par roll without using a reroll when the roll recorded the sub-par restart', async () => {
    const table = await referee.client.createTable({ name: 'Sub-par' });
    await alice.client.joinTable(table.invite_code);
    await referee.client.updateTable(table.id, { settings: { sub_par_restart: true } });
    const poor = await alice.client.rollAbilities(table.id, { seed: SUB_PAR_SEED });
    expect(poor.rolls.sub_par).toBe(true);
    expect(poor.rules.sub_par_restart).toBe(true);
    expect(poor.rerolls_left).toBe(0);

    const fresh = await alice.client.rollAbilities(table.id, { seed: 5 });
    expect(fresh.rolls.sub_par).toBe(false);
    expect(fresh.rerolls_left).toBe(0);
    // The sub-par roll is closed, and the new roll used no reroll, so a third roll is refused.
    await expect(alice.client.rollHitPoints(poor.id, { class_id: 'fighter' })).rejects.toSatisfy((error) =>
      isProblem(error, 'ability_roll_used'),
    );
    await expect(alice.client.rollAbilities(table.id, { seed: 7 })).rejects.toSatisfy((error) =>
      isProblem(error, 'ability_rerolls_used'),
    );
  });
});
