/**
 * Exploration in The Drowned Bell: moving, doors, treasure (emptied, out of reach, and dropped), a room trap, stairs,
 * light, the map's tools, and a reload in the middle of the dungeon. The referee moves the party between spots with
 * `place_party` through the SDK, and the player drives the thing under test through the interface. Each test fixes
 * the session seed, because a door, a search, a trap, and a torch each roll dice.
 */
import type { Page } from '@playwright/test';
import { SCREENS_DIR } from './support/env';
import { stepParty } from './support/combat';
import { expect, expectNoRawText, readFeedLines, test } from './support/fixtures';
import {
  clickSquare,
  dungeonMap,
  dungeonTable,
  expectPartyAt,
  lightStatus,
  lightTorch,
  mapOptions,
  openScene,
  partyActions,
  pickFromMenu,
  scenePanel,
  squarePoint,
  type DungeonTable,
} from './support/map';
import type { GameState } from '@bxvtt/shared/protocol';
import { placeParty, send } from './support/table';

const PRIORY = 'priory';

/** Puts the party on a square of the priory. */
function placer({ ruth, table }: DungeonTable) {
  return (x: number, y: number, facing: 'north' | 'south' | 'east' | 'west', level = 1) =>
    placeParty(ruth.client, table.id, { dungeon: PRIORY, level, x, y, facing });
}

/** Opens the feed tab and returns its lines. */
async function feedLines(page: Page): Promise<string[]> {
  await page.getByRole('tab', { name: /^Feed/ }).click();
  return readFeedLines(page);
}

/** A screenshot of a 120-pixel square of the map around a square, for comparing what two people see. */
async function mapPatch(page: Page, dx: number, dy: number): Promise<Buffer> {
  const point = await squarePoint(page, dx, dy);
  return page.screenshot({ clip: { x: point.x - 60, y: point.y - 60, width: 120, height: 120 } });
}

test.describe('exploration', () => {
  test('the caller moves with the keyboard and by click, and a wall refuses a move', async ({ crew }) => {
    const { sam, ruth, table } = await dungeonTable(crew);
    await expectPartyAt(sam.page, 14, 23);

    // The map's label and its description both say that the arrow keys move the party (D-204).
    await expect(dungeonMap(sam.page)).toHaveAccessibleName(/The arrow keys move the party/);
    await expect(dungeonMap(sam.page)).toHaveAccessibleDescription(/^Arrow keys move the party\. Shift and/);

    // The arrow keys move the party while the map has focus, and the referee sees the move.
    await dungeonMap(sam.page).focus();
    await sam.page.keyboard.press('ArrowUp');
    await expectPartyAt(sam.page, 14, 22);
    await expectPartyAt(ruth.page, 14, 22);

    // W, A, S, and D no longer move the party.
    await sam.page.keyboard.press('w');
    await sam.page.waitForTimeout(800);
    await expectPartyAt(sam.page, 14, 22);

    // A click on the square beside the party moves it there.
    await clickSquare(sam.page, -1, 0);
    await expectPartyAt(sam.page, 13, 22);
    await expectPartyAt(ruth.page, 13, 22);
    await expect
      .poll(async () => (await sam.client.getGame(table.id)).view.location)
      .toMatchObject({ position: [13, 22] });

    // West of the stair is solid rock. bxapi refuses the move, and the player reads why beside the party.
    await dungeonMap(sam.page).focus();
    await sam.page.keyboard.press('ArrowLeft');
    await expect(sam.page.getByText(/wall/i).first()).toBeVisible();
    await expectPartyAt(sam.page, 13, 22);
    await sam.page.screenshot({ path: `${SCREENS_DIR}/explore-blocked-move.png` });
  });

  test('an ordinary door opens, a stuck door is forced, and a gated door wants holy water', async ({
    crew,
  }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam, ruth, table } = setup;
    const place = placer(setup);
    const scene = scenePanel(sam.page);
    const door = scene.getByRole('button', { name: 'Door' });
    await lightTorch(sam.page);
    await openScene(sam.page);

    // The chapter house's south door, from the corridor below it.
    await place(12, 15, 'north');
    await expect(scene.getByText('A door to the north is closed.')).toBeVisible();
    await pickFromMenu(door, 'Open door');
    await expect(scene.getByText('A door to the north is open.')).toBeVisible();

    // The chapter house's north door is stuck. Flarg forces it.
    await place(12, 9, 'south');
    await expect(scene.getByText('A door to the south is closed.')).toBeVisible();
    await pickFromMenu(door, 'Open door');
    // The refusal shows beside the party, and the map's live region speaks the same words.
    await expect(
      sam.page.getByText('The door is stuck. Choose a party member to force it open.').first(),
    ).toBeVisible();
    await expect(scene.getByText('The door is stuck.')).toBeVisible();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (await scene.getByText('A door to the south is open.').isVisible()) break;
      await pickFromMenu(door, 'Force door', /^Flarg/);
      await sam.page.waitForTimeout(500);
    }
    await expect(scene.getByText('A door to the south is open.')).toBeVisible();

    // The chapel's bronze doors refuse with the adventure's own words until someone carries holy water.
    await place(18, 15, 'north');
    await send(ruth.client, table.id, {
      command_type: 'remove_item',
      character_id: 'character-0004',
      item_id: 'holy_water',
      quantity: 1,
    });
    await pickFromMenu(door, 'Open door');
    await expect(sam.page.getByText(/POUR AND ENTER/).first()).toBeVisible();
    await expect(scene.getByText('A door to the north is closed.')).toBeVisible();
    await send(ruth.client, table.id, {
      command_type: 'grant_item',
      character_id: 'character-0004',
      item_id: 'holy_water',
      quantity: 1,
    });
    await pickFromMenu(door, 'Open door');
    await expect(scene.getByText('A door to the north is open.')).toBeVisible();

    const lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/holy water runs away/);
    expectNoRawText(lines, "Sam's feed after the doors");
  });

  test('a locked door: the thief picks the lock and the caller opens it', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 4 });
    const { sam } = setup;
    const scene = scenePanel(sam.page);
    const door = scene.getByRole('button', { name: 'Door' });
    await lightTorch(sam.page);
    await openScene(sam.page);

    // The cellarer's store, south of the kitchen.
    await placer(setup)(2, 18, 'south');
    await pickFromMenu(door, 'Open door');
    await expect(sam.page.getByText(/locked/i).first()).toBeVisible();
    await expect(scene.getByText('The door is locked.')).toBeVisible();
    // Only the thief has the skill, so the menu names her.
    await pickFromMenu(door, 'Pick lock: Tinks');
    await expect(scene.getByText('The door is unlocked.')).toBeVisible();
    await pickFromMenu(door, 'Open door');
    await expect(scene.getByText('A door to the south is open.')).toBeVisible();
  });

  test('a secret door shows only after a search finds it', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 4 });
    const { sam, ruth } = setup;
    const scene = scenePanel(sam.page);
    await lightTorch(sam.page);
    await openScene(sam.page);
    await openScene(ruth.page);

    // The chapter house's east wall hides the way into the chapel.
    await placer(setup)(15, 12, 'east');
    await expect(scene.getByRole('heading', { name: 'Chapter house' })).toBeVisible();
    await expect(scene.getByText(/A door to the east/)).toHaveCount(0);
    const search = partyActions(sam.page).getByRole('button', { name: 'Search' });
    for (const member of ['Flarg', 'Tinks', 'Clarence', 'Mazpar']) {
      if (await scene.getByText(/A door to the east/).isVisible()) break;
      await pickFromMenu(search, 'Search for secret doors', member);
      await sam.page.waitForTimeout(800);
    }
    await expect(scene.getByText('A door to the east is closed.')).toBeVisible();
    // The referee's lens shows the same door, now found.
    await expect(scenePanel(ruth.page).getByText('A door to the east is closed.')).toBeVisible();

    const lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/secret door/i);
  });

  test('treasure with a trap hurts the taker, and treasure without one goes into packs', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 4 });
    const { sam } = setup;
    const place = placer(setup);
    const scene = scenePanel(sam.page);
    await openScene(sam.page);

    // The warden's iron chest is trapped, but the party hasn't found the trap, so the row doesn't say so.
    await place(26, 17, 'east');
    const take = scene.getByRole('button', { name: 'Take', exact: true });
    await expect(scene.getByText(/A heavy hasp holds the lid shut/)).toBeVisible();
    await expect(scene.getByText('Trapped', { exact: true })).toHaveCount(0);
    await expect(take).toHaveAccessibleDescription(/A heavy hasp holds the lid shut/);
    const treasureMenu = partyActions(sam.page).getByRole('button', { name: /^Treasure/ });
    await expect(treasureMenu).toBeVisible();
    await take.click();
    // The emptied chest stays in the scene with an "Emptied" badge, and nothing offers to take it again.
    const chest = scene.getByRole('listitem').filter({ hasText: 'A heavy hasp holds the lid shut' });
    await expect(chest.getByText('Emptied', { exact: true })).toBeVisible();
    await expect(take).toHaveCount(0);
    await expect(scene.getByRole('button', { name: 'Take anyway' })).toHaveCount(0);
    await expect(chest.getByRole('button')).toHaveCount(0);
    await expect(treasureMenu).toHaveCount(0);
    let lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/trap/i);
    expect(lines.join('\n')).toMatch(/iron key/i);
    // The marching order row's button names the member, and its description gives her hit points.
    await sam.page.getByRole('tab', { name: 'Party' }).click();
    await expect(
      sam.page
        .getByRole('list', { name: 'Marching order' })
        .getByRole('button', { name: 'Flarg', exact: true }),
    ).toHaveAccessibleDescription(/, [1-9] of 10 hit points/);

    // The chapel altar has no trap.
    await place(17, 12, 'east');
    await expect(take).toBeVisible();
    await take.click();
    await expect(take).toHaveCount(0);
    lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/2 vials of holy water/i);
    // The feed names a piece of jewellery by its own name, which the player view shows in the taker's inventory.
    expect(lines.join('\n')).toMatch(/takes a silver altar candlestick/);
    expect(lines.join('\n')).not.toMatch(/piece of jewellery/);
    // The potion isn't identified, so the feed uses its masked name and doesn't say what it is.
    expect(lines.join('\n')).toMatch(/takes a potion\b/);
    expect(lines.join('\n')).not.toMatch(/potion of healing/i);
    expectNoRawText(lines, "Sam's feed after the treasure");
  });

  test('a named valuable reads by its phrase when it is taken, given, and dropped', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 4 });
    const { sam, table } = setup;
    const scene = scenePanel(sam.page);
    await openScene(sam.page);

    // The chapel altar holds two silver altar candlesticks, whose phrase is the default that osrlib makes.
    await placer(setup)(17, 12, 'east');
    await scene.getByRole('button', { name: 'Take', exact: true }).click();
    await expect(scene.getByRole('button', { name: 'Take', exact: true })).toHaveCount(0);
    const game = await sam.client.getGame(table.id);
    const ids = Object.keys(game.view.valuable_names);
    expect(ids).toHaveLength(2);
    const carrying = (state: GameState, id: string) => {
      const member = state.view.party.find((candidate) =>
        JSON.stringify(candidate.inventory).includes(`"${id}"`),
      );
      if (member === undefined) throw new Error(`no one carries ${id}`);
      return member;
    };
    const [first, second] = ids;
    if (first === undefined || second === undefined) throw new Error('no valuable ids');
    const holder = carrying(game, first);
    const other = game.view.party.find((member) => member.id !== holder.id);
    if (other === undefined) throw new Error('the party has one member');
    const given = await send(sam.client, table.id, {
      command_type: 'give_items',
      character_id: holder.id,
      recipient_id: other.id,
      item_ids: [first],
    });
    const dropper = carrying(given, second);
    await send(sam.client, table.id, {
      command_type: 'drop_items',
      character_id: dropper.id,
      item_ids: [second],
    });

    const lines = (await feedLines(sam.page)).join('\n');
    expect(lines).toMatch(new RegExp(`${holder.name} takes .*silver altar candlesticks?`));
    expect(lines).toContain(`${holder.name} gives a silver altar candlestick to ${other.name}.`);
    expect(lines).toContain(`${dropper.name} drops a silver altar candlestick.`);
    expect(lines).not.toMatch(/piece of jewellery/);
    // The dropped candlestick lies in a pile that the scene lists by the same phrase.
    await openScene(sam.page);
    await expect(scene.getByText('A silver altar candlestick.', { exact: true })).toBeVisible();
    expectNoRawText(await feedLines(sam.page), "Sam's feed after the candlesticks");
  });

  test("a possessive valuable reads by the phrase the adventure's author set", async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 4 });
    const { sam, table } = setup;
    const scene = scenePanel(sam.page);
    await openScene(sam.page);

    // The sealed coffin in the founders' tomb, on level 2, holds the abbot's gold ring, whose default phrase would be "an abbot's".
    await placer(setup)(22, 3, 'east', 2);
    await scene.getByRole('button', { name: 'Take', exact: true }).click();
    await expect(scene.getByRole('button', { name: 'Take', exact: true })).toHaveCount(0);
    const game = await sam.client.getGame(table.id);
    expect(Object.values(game.view.valuable_names)).toEqual(["Abbot's gold ring"]);
    expect(Object.values(game.view.valuable_phrases)).toEqual(["the abbot's gold ring"]);
    const lines = (await feedLines(sam.page)).join('\n');
    expect(lines).toMatch(/ takes the abbot's gold ring and /);
    expect(lines).not.toMatch(/an abbot's|piece of jewellery/);
  });

  test('a treasure out of reach says to step closer, and stepping onto it offers Take', async ({ crew }) => {
    // With this seed, Flarg's torch lights and the step onto the ledge doesn't spring the broken stair's trap.
    const setup = await dungeonTable(crew, { seed: 7 });
    const { sam, table } = setup;
    const scene = scenePanel(sam.page);
    await send(sam.client, table.id, {
      command_type: 'light_source',
      character_id: 'character-0001',
      item_id: 'torch',
    });
    await openScene(sam.page);

    // The satchel lies on the ledge, one square west of the party, in the same room.
    await placer(setup)(2, 7, 'west');
    await expect(scene.getByRole('heading', { name: 'Broken stair' })).toBeVisible();
    const satchel = scene.getByRole('listitem').filter({ hasText: 'A satchel of oiled leather' });
    await expect(satchel).toBeVisible();
    await expect(satchel.getByText('Step closer to reach it.')).toBeVisible();
    await expect(satchel.getByRole('button')).toHaveCount(0);
    await expect(partyActions(sam.page).getByRole('button', { name: /^Treasure/ })).toHaveCount(0);

    await stepParty(sam.page, 'ArrowLeft', [1, 7]);
    await expect(satchel.getByText('Step closer to reach it.')).toHaveCount(0);
    await expect(satchel.getByRole('button', { name: 'Take', exact: true })).toBeVisible();
    await expect(partyActions(sam.page).getByRole('button', { name: /^Treasure/ })).toBeVisible();
  });

  test('a room trap the party springs shows as a badge beside the room’s name', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam, table } = setup;
    const scene = scenePanel(sam.page);
    await openScene(sam.page);

    // The corridor west of the scriptorium. Walking in brings down the loose blocks in its ceiling.
    await placer(setup)(8, 3, 'east');
    await send(sam.client, table.id, { command_type: 'open_door', direction: 'east' });
    await expect(scene.getByText('Trap sprung', { exact: true })).toHaveCount(0);
    await stepParty(sam.page, 'ArrowRight', [9, 3]);
    await expect(scene.getByRole('heading', { name: 'Scriptorium' })).toBeVisible();
    const badge = scene.getByText('Trap sprung', { exact: true });
    await expect(badge).toBeVisible();
    // The badge belongs to the room, not to a row of the list.
    await expect(
      scene.getByRole('list', { name: 'Things here' }).getByText('Trap sprung', { exact: true }),
    ).toHaveCount(0);
    await expect(scene.getByText(/trap in this room/i)).toHaveCount(0);
    // It stays in the header when the description folds.
    await scene.getByRole('button', { name: 'Collapse description' }).click();
    await expect(scene.getByRole('button', { name: 'Show description' })).toBeVisible();
    await expect(badge).toBeVisible();
  });

  test('dropped goods list what lies there by name, and Pick up takes them', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam, table } = setup;
    const scene = scenePanel(sam.page);
    await openScene(sam.page);

    // Flarg and Tinks put down some of their gear in the corridor south of the chapter house.
    await placer(setup)(12, 15, 'north');
    await send(sam.client, table.id, {
      command_type: 'drop_items',
      character_id: 'character-0001',
      item_ids: ['torch', 'torch', 'tinder_box'],
      coins: { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 },
    });
    await send(sam.client, table.id, {
      command_type: 'drop_items',
      character_id: 'character-0002',
      item_ids: ['thieves_tools'],
    });
    const pile = scene.getByRole('listitem').filter({ hasText: 'Dropped goods lie here.' });
    const contents = '5 gold pieces, 2 torches, a tinder box, and a set of thieves’ tools.';
    await expect(pile.getByText(contents, { exact: true })).toBeVisible();
    const pickUp = pile.getByRole('button', { name: 'Pick up dropped goods' });
    await expect(pickUp).toHaveText('Pick up');
    await expect(pickUp).toHaveAccessibleDescription(contents);

    await pickUp.click();
    await expect(pile).toHaveCount(0);
    await expect.poll(async () => Object.keys((await sam.client.getGame(table.id)).view.piles)).toEqual([]);
    const lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/2 torches/);
    expect(lines.join('\n')).toMatch(/thieves’ tools/);
    expectNoRawText(lines, "Sam's feed after the pick-up");
  });

  test('stairs take the party to the next level, and a player can look back at the first', async ({
    crew,
  }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam, ruth } = setup;
    const scene = scenePanel(sam.page);

    // The night stair, in the north-west of the undercroft.
    await placer(setup)(3, 3, 'east');
    await expect(scene.getByText('Stairs lead down.')).toBeVisible();
    await scene.getByRole('button', { name: 'Go down the stairs' }).click();
    await expect
      .poll(async () => (await sam.client.getGame(setup.table.id)).view.location)
      .toMatchObject({ level_number: 2 });
    // The button's name is the level it shows. Its hover help says what it does.
    const levelButton = mapOptions(sam.page).getByRole('button', { name: /level 2$/i });
    await expect(levelButton).toBeVisible();
    await levelButton.hover();
    await expect(sam.page.getByRole('tooltip')).toHaveText('Choose which dungeon level the map shows');
    await sam.page.mouse.move(0, 0);

    // Looking at level 1 leaves the party where it is and offers a way back.
    await levelButton.click();
    await sam.page.getByRole('menuitemcheckbox', { name: 'Level 1' }).click();
    await expect(sam.page.getByRole('status').filter({ hasText: /The party is on .*2/ })).toBeVisible();
    await sam.page.getByRole('button', { name: 'Show party' }).click();
    await expect(sam.page.getByRole('status').filter({ hasText: /The party is on/ })).toHaveCount(0);

    // The referee's map follows the party to the new level too.
    await expect(mapOptions(ruth.page).getByRole('button', { name: /level 2$/i })).toBeVisible();
    await sam.page.screenshot({ path: `${SCREENS_DIR}/explore-level-2.png` });
  });

  test('a torch burns out after an hour of game time, and the map says so', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam, ruth, table } = setup;
    await lightTorch(sam.page);
    const status = lightStatus(sam.page);
    const light = mapOptions(sam.page).getByRole('button', { name: /^Light: / });
    await expect(status).toHaveText("Flarg's torch, about 6 turns left");
    await expect(light).toHaveText('6 turns');
    await expect(light).toHaveAccessibleName("Light: Flarg's torch, about 6 turns left");
    // The party panel shows the light on the row of the member who carries it, in the map's words (D-207), and no
    // party-wide light banner.
    await sam.page.getByRole('tab', { name: 'Party' }).click();
    const order = sam.page.getByRole('list', { name: 'Marching order' });
    const flarg = order.getByRole('button', { name: /^Flarg\b/ });
    await expect(flarg).toHaveAccessibleDescription(
      /, torch, about 6 turns left\. Opens the character sheet\.$/,
    );
    await expect(order.getByRole('listitem').filter({ hasText: 'Flarg' })).toContainText(
      'Torch, about 6 turns left',
    );
    await expect(sam.page.getByRole('region', { name: 'The party', exact: true })).toHaveCount(0);

    await send(ruth.client, table.id, { command_type: 'advance_time', n: 3, unit: 'turn' });
    await expect(status).toHaveText("Flarg's torch, about 3 turns left");
    await expect(order.getByRole('listitem').filter({ hasText: 'Flarg' })).toContainText(
      'Torch, about 3 turns left',
    );
    await send(ruth.client, table.id, { command_type: 'advance_time', n: 3, unit: 'turn' });
    await expect(status).toHaveText('The party has no light.');
    await expect(light).toHaveAccessibleName('Light: The party has no light.');
    await expect(order.getByRole('listitem').filter({ hasText: 'Flarg' })).not.toContainText(/torch/i);
    const lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/torch/i);
  });

  test('pings, drawings, and pins reach the other person, and the author erases a drawing', async ({
    crew,
  }) => {
    const setup = await dungeonTable(crew, { seed: 1981, reducedMotion: true });
    const { sam, ruth, table } = setup;
    const tools = (page: Page) => page.getByRole('toolbar', { name: 'Map tools' });
    await placer(setup)(12, 15, 'east');
    await expectPartyAt(sam.page, 12, 15);
    await expectPartyAt(ruth.page, 12, 15);
    await ruth.page.waitForTimeout(800);

    // A ping two squares east shows on the referee's map.
    const beforePing = await mapPatch(ruth.page, 2, 0);
    await tools(sam.page).getByRole('button', { name: 'Ping' }).click();
    await clickSquare(sam.page, 2, 0);
    await expect.poll(async () => (await mapPatch(ruth.page, 2, 0)).equals(beforePing)).toBe(false);

    // A drawing reaches the server and the referee's map.
    await tools(sam.page).getByRole('button', { name: 'Draw' }).click();
    const from = await squarePoint(sam.page, -3, -1);
    const to = await squarePoint(sam.page, -1, -1);
    const beforeDraw = await mapPatch(ruth.page, -2, -1);
    await sam.page.mouse.move(from.x, from.y);
    await sam.page.mouse.down();
    await sam.page.mouse.move(to.x, to.y, { steps: 8 });
    await sam.page.mouse.up();
    const level = { dungeon_id: PRIORY, level_number: 1 };
    const strokes = async () =>
      (await ruth.client.getAnnotations(table.id, level)).items.filter((item) => item.kind === 'stroke');
    await expect.poll(async () => (await strokes()).length).toBe(1);
    await expect.poll(async () => (await mapPatch(ruth.page, -2, -1)).equals(beforeDraw)).toBe(false);

    // A pin with a note: the referee opens it from her own map.
    await tools(sam.page).getByRole('button', { name: 'Pin a note' }).click();
    await clickSquare(sam.page, 1, 2);
    const addPin = sam.page.getByRole('dialog', { name: 'Add pin' });
    await addPin.getByRole('textbox', { name: 'Note' }).fill('Rats scratch behind this wall');
    await addPin.getByRole('button', { name: 'Add pin' }).click();
    await expect(addPin).toHaveCount(0);
    // The pin's head is drawn above and to the left of the point it marks, so click the head.
    await ruth.page.waitForTimeout(500);
    await clickSquare(ruth.page, 0.825, 1.325);
    const pin = ruth.page.getByRole('dialog', { name: /^Pin / });
    await expect(pin).toContainText('Rats scratch behind this wall');
    await ruth.page.keyboard.press('Escape');

    // A pin only referees see never reaches the player.
    await tools(ruth.page).getByRole('button', { name: 'Pin a note' }).click();
    await clickSquare(ruth.page, -2, 2);
    const refereePin = ruth.page.getByRole('dialog', { name: 'Add pin' });
    await refereePin.getByRole('textbox', { name: 'Note' }).fill('The goblins wait here at night');
    await refereePin.getByRole('checkbox', { name: 'Visible only to referees' }).check();
    await refereePin.getByRole('button', { name: 'Add pin' }).click();
    await expect(refereePin).toHaveCount(0);
    await expect
      .poll(async () =>
        (await ruth.client.getAnnotations(table.id, level)).items.filter((a) => a.kind === 'pin'),
      )
      .toHaveLength(2);
    const samsPins = (await sam.client.getAnnotations(table.id, level)).items.filter((a) => a.kind === 'pin');
    expect(samsPins).toHaveLength(1);
    expect(JSON.stringify(samsPins)).not.toContain('The goblins wait here at night');

    // The author erases the drawing.
    await tools(sam.page).getByRole('button', { name: 'Erase' }).click();
    await sam.page.mouse.move(from.x, from.y);
    await sam.page.mouse.down();
    await sam.page.mouse.move(to.x, to.y, { steps: 8 });
    await sam.page.mouse.up();
    await expect.poll(async () => (await strokes()).length).toBe(0);
  });

  test('the ruler and the map styles work from the map chrome', async ({ crew }) => {
    const { sam } = await dungeonTable(crew, { seed: 1981 });

    // The ruler explains itself while it measures.
    const measure = sam.page
      .getByRole('toolbar', { name: 'Map tools' })
      .getByRole('button', { name: 'Measure' });
    await measure.click();
    await expect(measure).toHaveAttribute('aria-pressed', 'true');
    const point = await squarePoint(sam.page, 0, -2);
    await sam.page.mouse.move(point.x, point.y);
    await sam.page.waitForTimeout(400);

    // Each map style applies and survives a reload.
    const styles = sam.page.getByRole('radiogroup', { name: 'Map style' });
    for (const name of ['Torchlit map', 'Parchment map', 'Blueprint map']) {
      const before = await mapPatch(sam.page, 0, 0);
      await styles.getByRole('radio', { name }).click();
      await expect(styles.getByRole('radio', { name })).toBeChecked();
      await expect.poll(async () => (await mapPatch(sam.page, 0, 0)).equals(before)).toBe(false);
    }
    await styles.getByRole('radio', { name: 'Parchment map' }).click();
    await sam.page.reload();
    await expect(
      sam.page.getByRole('radiogroup', { name: 'Map style' }).getByRole('radio', { name: 'Parchment map' }),
    ).toBeChecked();
  });

  test('a reload in the middle of the dungeon brings back the map, the scene, and the light', async ({
    crew,
  }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam } = setup;
    await lightTorch(sam.page);
    await placer(setup)(12, 12, 'north');
    await expect(scenePanel(sam.page).getByRole('heading', { name: 'Chapter house' })).toBeVisible();
    const before = await feedLines(sam.page);

    await sam.page.reload();
    await expect(dungeonMap(sam.page)).toBeVisible();
    await expectPartyAt(sam.page, 12, 12);
    await expect(scenePanel(sam.page).getByRole('heading', { name: 'Chapter house' })).toBeVisible();
    await expect(lightStatus(sam.page)).toHaveText(/^Flarg's torch/);
    await expect(sam.page.getByRole('banner').getByText('Exploring')).toBeVisible();
    const after = await feedLines(sam.page);
    for (const line of before.filter((text) => /Flarg lights a torch|is placed/.test(text))) {
      expect(after).toContain(line);
    }
  });
});
