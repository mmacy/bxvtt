import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { AbilityRoll, CharacterCheckRequest } from '@bxvtt/shared/protocol';
import { countGold } from '../src/character-check';
import type { TestServer, TestUser } from './helpers';
import { createUser, startServer } from './helpers';

/** Counts the server's calls to bxapi's `POST /v1/characters`. */
function countCreations(server: TestServer): { count: () => number } {
  const bxapi = server.server.ctx.bxapi;
  const original = bxapi.post.bind(bxapi);
  let calls = 0;
  bxapi.post = (async (path: string, body: unknown, options?: Parameters<typeof original>[2]) => {
    if (path === '/v1/characters') calls += 1;
    return original(path, body, options);
  }) as typeof bxapi.post;
  return { count: () => calls };
}

describe('the character check', () => {
  let server: TestServer;
  let alice: TestUser;
  let bob: TestUser;
  let roll: AbilityRoll;
  let classId: string;
  let creations: { count: () => number };

  beforeAll(async () => {
    server = await startServer();
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    creations = countCreations(server);
    roll = await alice.client.rollAbilities({ seed: 4242 });
    classId = roll.eligible_class_ids.includes('fighter') ? 'fighter' : (roll.eligible_class_ids[0] ?? '');
    expect(classId).not.toBe('');
  });

  afterAll(async () => {
    await server.close();
  });

  const body = (extra: Partial<CharacterCheckRequest> = {}): CharacterCheckRequest => ({
    name: 'Brenna',
    class_id: classId,
    alignment: 'lawful',
    ability_roll_id: roll.id,
    ...extra,
  });

  it('checks choices and counts the gold without storing a character or using the roll', async () => {
    const before = creations.count();
    const check = await alice.client.checkCharacter(body({ purchases: [{ item_id: 'torch' }] }));
    expect(check).toMatchObject({ valid: true, problem: null });
    expect(check.gold_gp).toBeGreaterThanOrEqual(30);
    expect(check.gold_gp).toBeLessThanOrEqual(180);
    // One request checks the choices, and a few more count the gold, the first time only.
    const used = creations.count() - before;
    expect(used).toBeGreaterThanOrEqual(2);
    expect(used).toBeLessThanOrEqual(5);
    const again = await alice.client.checkCharacter(body());
    expect(again.gold_gp).toBe(check.gold_gp);
    expect(creations.count() - before - used).toBe(1);
    expect((await alice.client.getAbilityRoll(roll.id)).used).toBe(false);
    expect((await alice.client.listCharacters()).items).toEqual([]);
  });

  it('reports the gold that creating the character then gives', async () => {
    const reroll = await alice.client.rollAbilities({ seed: 777 });
    const fighterOrFirst = reroll.eligible_class_ids.includes('fighter')
      ? 'fighter'
      : (reroll.eligible_class_ids[0] ?? '');
    const choices = {
      name: 'Wren',
      class_id: fighterOrFirst,
      alignment: 'neutral' as const,
      ability_roll_id: reroll.id,
      hp_reroll_at_first_level: true,
    };
    const check = await alice.client.checkCharacter(choices);
    expect(check.valid).toBe(true);
    const character = await alice.client.createCharacter(choices);
    const purse = (character.character.inventory as { purse?: { gp?: number } }).purse;
    expect(purse?.gp).toBe(check.gold_gp);
  });

  it("returns bxapi's problem with its members when a choice breaks a rule", async () => {
    const tooDear = await alice.client.checkCharacter(
      body({ purchases: [{ item_id: 'plate_mail', quantity: 4 }] }),
    );
    expect(tooDear.valid).toBe(false);
    expect(tooDear.problem).toMatchObject({ code: 'character_invalid', status: 422 });
    expect(tooDear.problem?.rejections?.[0]?.code).toBe('items.purchase.insufficient_funds');
    expect(tooDear.gold_gp).not.toBeNull();

    const unknown = await alice.client.checkCharacter(body({ purchases: [{ item_id: 'nope' }] }));
    expect(unknown.problem).toMatchObject({ field: 'purchases', index: 0, id: 'nope' });

    const unbought = await alice.client.checkCharacter(body({ equip_item_ids: ['sword'] }));
    expect(unbought.problem).toMatchObject({ field: 'equip_item_ids', index: 0, id: 'sword' });

    const ineligible = ['magic_user', 'cleric', 'fighter', 'thief', 'dwarf', 'elf', 'halfling'].find(
      (id) => !roll.eligible_class_ids.includes(id),
    );
    if (ineligible !== undefined) {
      const wrongClass = await alice.client.checkCharacter(body({ class_id: ineligible }));
      expect(wrongClass.valid).toBe(false);
      expect(wrongClass.problem?.rejections?.[0]?.code).toMatch(/^creation\.class\./);
      expect(wrongClass.gold_gp).toBeNull();
    }
    expect((await alice.client.getAbilityRoll(roll.id)).used).toBe(false);
  });

  it("refuses another user's roll and a used roll", async () => {
    await expect(bob.client.checkCharacter(body())).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    const used = await alice.client.rollAbilities({ seed: 99 });
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

  it('limits how fast one user checks characters', async () => {
    const alice = await createUser(server, 'Alice');
    const roll = await alice.client.rollAbilities({ seed: 5 });
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
  });
});

describe('countGold', () => {
  /** The equipment catalog's prices, as bxapi had them when this test was written. */
  const lots = [
    ...['javelin', 'iron_spikes', 'pole', 'rope', 'sack_small', 'torch', 'waterskin', 'wine'].map((id) => ({
      id,
      cost: 1,
    })),
    ...['sling', 'staff', 'hammer', 'oil_flask', 'sack_large'].map((id) => ({ id, cost: 2 })),
    ...['club', 'dagger', 'spear', 'stakes_and_mallet', 'tinder_box'].map((id) => ({ id, cost: 3 })),
    { id: 'hand_axe', cost: 4 },
    ...['lance', 'mace', 'war_hammer', 'backpack', 'garlic', 'mirror', 'arrows'].map((id) => ({
      id,
      cost: 5,
    })),
    ...['sword', 'shield', 'crowbar', 'lantern', 'wolfsbane', 'crossbow_bolts'].map((id) => ({
      id,
      cost: 10,
    })),
    { id: 'leather', cost: 20 },
    { id: 'crossbow', cost: 30 },
    { id: 'chainmail', cost: 40 },
  ];
  const cost = new Map(lots.map((lot) => [lot.id, lot.cost]));

  /** Simulates bxapi buying in order from a purse of `gold`. */
  const purse = (gold: number) => {
    let probes = 0;
    const probe = async (purchases: { item_id: string; quantity: number }[]) => {
      probes += 1;
      let left = gold;
      for (const purchase of purchases) {
        const price = (cost.get(purchase.item_id) ?? 0) * purchase.quantity;
        if (price > left) return { kind: 'short' as const, itemId: purchase.item_id };
        left -= price;
      }
      return { kind: 'covered' as const };
    };
    return { probe, probes: () => probes };
  };

  it('finds the exact gold for every amount up to 3,000 gp', async () => {
    let most = 0;
    for (let gold = 0; gold <= 3000; gold += 1) {
      const simulated = purse(gold);
      await expect(countGold(lots, simulated.probe)).resolves.toBe(gold);
      most = Math.max(most, simulated.probes());
    }
    expect(most).toBeLessThanOrEqual(6);
  });

  it('finds 3d6 x 10 gp in at most three probes', async () => {
    for (let gold = 30; gold <= 180; gold += 10) {
      const simulated = purse(gold);
      await expect(countGold(lots, simulated.probe)).resolves.toBe(gold);
      expect(simulated.probes()).toBeLessThanOrEqual(3);
    }
  });

  it('gives up without an item that costs 1 gp', async () => {
    await expect(countGold([{ id: 'sword', cost: 10 }], purse(50).probe)).resolves.toBeNull();
  });
});
