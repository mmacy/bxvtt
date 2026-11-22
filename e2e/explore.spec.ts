/**
 * Exploration in The Drowned Bell: moving, doors, treasure, stairs, light, the map's tools, and a reload in the
 * middle of the dungeon. The referee moves the party between spots with `place_party` through the SDK, and the
 * player drives the thing under test through the interface. Each test fixes the session seed, because a door, a
 * search, and a trap each roll dice.
 */
import type { Page } from '@playwright/test';
import { SCREENS_DIR } from './support/env';
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
    await expect(scene.getByText('A door to the north, closed.')).toBeVisible();
    await pickFromMenu(door, 'Open it');
    await expect(scene.getByText('A door to the north, open.')).toBeVisible();

    // The chapter house's north door is stuck. Brenna forces it.
    await place(12, 9, 'south');
    await expect(scene.getByText('A door to the south, closed.')).toBeVisible();
    await pickFromMenu(door, 'Open it');
    // The refusal shows beside the party, and the map's live region speaks the same words.
    await expect(
      sam.page.getByText('The door is stuck. Have a strong member force it open.').first(),
    ).toBeVisible();
    await expect(scene.getByText('It is stuck.')).toBeVisible();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (await scene.getByText('A door to the south, open.').isVisible()) break;
      await pickFromMenu(door, 'Force it open', /^Brenna/);
      await sam.page.waitForTimeout(500);
    }
    await expect(scene.getByText('A door to the south, open.')).toBeVisible();

    // The chapel's bronze doors refuse with the adventure's own words until someone carries holy water.
    await place(18, 15, 'north');
    await send(ruth.client, table.id, {
      command_type: 'remove_item',
      character_id: 'character-0004',
      item_id: 'holy_water',
      quantity: 1,
    });
    await pickFromMenu(door, 'Open it');
    await expect(sam.page.getByText(/POUR AND ENTER/).first()).toBeVisible();
    await expect(scene.getByText('A door to the north, closed.')).toBeVisible();
    await send(ruth.client, table.id, {
      command_type: 'grant_item',
      character_id: 'character-0004',
      item_id: 'holy_water',
      quantity: 1,
    });
    await pickFromMenu(door, 'Open it');
    await expect(scene.getByText('A door to the north, open.')).toBeVisible();

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
    await pickFromMenu(door, 'Open it');
    await expect(sam.page.getByText(/locked/i).first()).toBeVisible();
    await expect(scene.getByText('It is locked.')).toBeVisible();
    // Only the thief has the skill, so the menu names her.
    await pickFromMenu(door, 'Pick the lock: Wren');
    await expect(scene.getByText('Its lock is open.')).toBeVisible();
    await pickFromMenu(door, 'Open it');
    await expect(scene.getByText('A door to the south, open.')).toBeVisible();
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
    for (const member of ['Brenna', 'Wren', 'Osric', 'Tamsin']) {
      if (await scene.getByText(/A door to the east/).isVisible()) break;
      await pickFromMenu(search, 'Search for secret doors', member);
      await sam.page.waitForTimeout(800);
    }
    await expect(scene.getByText('A door to the east, closed.')).toBeVisible();
    // The referee's lens shows the same door, now found.
    await expect(scenePanel(ruth.page).getByText('A door to the east, closed.')).toBeVisible();

    const lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/secret door/i);
  });

  test('treasure with a trap hurts the taker, and treasure without one goes into packs', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 4 });
    const { sam } = setup;
    const place = placer(setup);
    const scene = scenePanel(sam.page);
    await openScene(sam.page);

    // The warden's iron chest is trapped.
    await place(26, 17, 'east');
    await expect(scene.getByText('Treasure is within reach.')).toBeVisible();
    await pickFromMenu(scene.getByRole('button', { name: 'Treasure' }), 'Take the treasure');
    await expect(scene.getByText('Treasure is within reach.')).toHaveCount(0);
    let lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/trap/i);
    expect(lines.join('\n')).toMatch(/iron key/i);
    // The marching order row names the member and describes her hit points.
    await sam.page.getByRole('tab', { name: 'Party' }).click();
    await expect(
      sam.page.getByRole('list', { name: 'Marching order' }).getByRole('button', { name: /^Brenna\b/ }),
    ).toHaveAccessibleDescription(/^[1-9] of 10 hit points/);

    // The chapel altar has no trap.
    await place(17, 12, 'east');
    await expect(scene.getByText('Treasure is within reach.')).toBeVisible();
    await pickFromMenu(scene.getByRole('button', { name: 'Treasure' }), 'Take the treasure');
    await expect(scene.getByText('Treasure is within reach.')).toHaveCount(0);
    lines = await feedLines(sam.page);
    expect(lines.join('\n')).toMatch(/holy water/i);
    expect(lines.join('\n')).toMatch(/candlestick/i);
    expectNoRawText(lines, "Sam's feed after the treasure");
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
    const levelButton = sam.page.getByRole('button', { name: /^Level shown: .*Choose another level\.$/ });
    await expect(levelButton).toBeVisible();
    await expect(levelButton).toHaveAccessibleName(/2/);

    // Looking at level 1 leaves the party where it is and offers a way back.
    await levelButton.click();
    await sam.page.getByRole('menuitemcheckbox', { name: 'Level 1' }).click();
    await expect(sam.page.getByRole('status').filter({ hasText: /The party is on .*2/ })).toBeVisible();
    await sam.page.getByRole('button', { name: 'Show the party' }).click();
    await expect(sam.page.getByRole('status').filter({ hasText: /The party is on/ })).toHaveCount(0);

    // The referee's map follows the party to the new level too.
    await expect(ruth.page.getByRole('button', { name: /^Level shown: .*2/ })).toBeVisible();
    await sam.page.screenshot({ path: `${SCREENS_DIR}/explore-level-2.png` });
  });

  test('a torch burns out after an hour of game time, and the map says so', async ({ crew }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam, ruth, table } = setup;
    await lightTorch(sam.page);
    const status = lightStatus(sam.page);
    const light = mapOptions(sam.page).getByRole('button', { name: /^Light: / });
    await expect(status).toHaveText("Brenna's torch, about 6 turns left");
    await expect(light).toHaveText('6 turns');
    await expect(light).toHaveAccessibleName("Light: Brenna's torch, about 6 turns left");
    // The party panel shows the light on the row of the member who carries it, in the map's words (D-207), and no
    // party-wide light banner.
    await sam.page.getByRole('tab', { name: 'Party' }).click();
    const order = sam.page.getByRole('list', { name: 'Marching order' });
    const brenna = order.getByRole('button', { name: /^Brenna\b/ });
    await expect(brenna).toHaveAccessibleDescription(
      /, torch, about 6 turns left\. Opens the character sheet\.$/,
    );
    await expect(order.getByRole('listitem').filter({ hasText: 'Brenna' })).toContainText(
      'Torch, about 6 turns left',
    );
    await expect(sam.page.getByRole('region', { name: 'The party', exact: true })).toHaveCount(0);

    await send(ruth.client, table.id, { command_type: 'advance_time', n: 3, unit: 'turn' });
    await expect(status).toHaveText("Brenna's torch, about 3 turns left");
    await expect(order.getByRole('listitem').filter({ hasText: 'Brenna' })).toContainText(
      'Torch, about 3 turns left',
    );
    await send(ruth.client, table.id, { command_type: 'advance_time', n: 3, unit: 'turn' });
    await expect(status).toHaveText('The party has no light.');
    await expect(light).toHaveAccessibleName('Light: The party has no light.');
    await expect(order.getByRole('listitem').filter({ hasText: 'Brenna' })).not.toContainText(/torch/i);
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
    const addPin = sam.page.getByRole('dialog', { name: 'Add a pin' });
    await addPin.getByRole('textbox', { name: 'Note' }).fill('Rats scratch behind this wall');
    await addPin.getByRole('button', { name: 'Add the pin' }).click();
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
    const refereePin = ruth.page.getByRole('dialog', { name: 'Add a pin' });
    await refereePin.getByRole('textbox', { name: 'Note' }).fill('The goblins wait here at night');
    await refereePin.getByRole('checkbox', { name: 'Only referees see this pin' }).check();
    await refereePin.getByRole('button', { name: 'Add the pin' }).click();
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
    await expect(lightStatus(sam.page)).toHaveText(/^Brenna's torch/);
    await expect(sam.page.getByRole('banner').getByText('Exploring')).toBeVisible();
    const after = await feedLines(sam.page);
    for (const line of before.filter((text) => /Brenna lights a torch|is placed/.test(text))) {
      expect(after).toContain(line);
    }
  });
});
