/**
 * The map's chrome and its keyboard paths in The Drowned Bell: the keyboard cursor that picks a cell or a door for
 * the referee, the Pins list, the minimap that folds, the ruler and pings in words, and the scene panel that folds
 * to its title bar. Ruth is the referee and Sam is the player and caller.
 */
import { SCREENS_DIR } from './support/env';
import { expect, test } from './support/fixtures';
import {
  clickSquare,
  dungeonMap,
  dungeonTable,
  expectPartyAt,
  mapAnnouncement,
  mapOptions,
  openScene,
  pickFromMenu,
  scenePanel,
  showKeyboardCursor,
} from './support/map';
import { DOOR_PROMPT, PLACE_PROMPT, openQuickAction } from './support/referee';
import { placeParty, waitForGame } from './support/table';

const MINIMAP = 'Minimap. Click or drag to move the map.';

test.describe('the map with the keyboard', () => {
  test('the referee picks a cell and a door on the map with the keyboard alone', async ({ crew }) => {
    const { ruth, sam, table } = await dungeonTable(crew, { seed: 1981 });
    await expectPartyAt(ruth.page, 14, 23);

    // Place the party: the pick starts from the keyboard, and the map takes focus with its cursor.
    const place = await openQuickAction(ruth.page, 'Place the party');
    await place.getByRole('radio', { name: 'Cell' }).click();
    await place.getByRole('button', { name: 'Pick a cell on the map' }).press('Enter');
    await expect(ruth.page.getByText(PLACE_PROMPT)).toBeVisible();
    // The prompt sits below the map's toolbar, so the level switcher stays usable during a pick (R-201).
    const promptBox = await ruth.page.getByText(PLACE_PROMPT).boundingBox();
    const toolbarBox = await mapOptions(ruth.page).boundingBox();
    expect(promptBox && toolbarBox && promptBox.y >= toolbarBox.y + toolbarBox.height).toBe(true);
    await expect(dungeonMap(ruth.page)).toBeFocused();
    await showKeyboardCursor(ruth.page);
    await expect(
      mapAnnouncement(ruth.page, /the party's square\..* Press Enter to choose this square/),
    ).toBeAttached();
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowRight']) await ruth.page.keyboard.press(key);
    await expect(
      mapAnnouncement(
        ruth.page,
        /^Gatehouse stair(, not yet seen by the party)?, 2 squares north and 1 square east of the party\. Press Enter/,
      ),
    ).toBeAttached();
    await ruth.page.keyboard.press('Enter');
    await expect(ruth.page.getByText(PLACE_PROMPT)).toHaveCount(0);
    await expect(place.getByText(/^Level 1, Gatehouse stair/)).toBeVisible();
    await place.getByRole('button', { name: 'Place party' }).press('Enter');
    await waitForGame(
      sam.client,
      table.id,
      (game) =>
        game.view.location.kind === 'dungeon' &&
        game.view.location.position?.[0] === 15 &&
        game.view.location.position?.[1] === 21,
      'the party should stand on the cell the referee picked',
    );
    await expectPartyAt(sam.page, 15, 21);

    // Change a door: the cursor starts on the party's square, moves north into the chapter house, and turns to
    // the south side, which is the door the party faces.
    await placeParty(ruth.client, table.id, { dungeon: 'priory', level: 1, x: 12, y: 15, facing: 'north' });
    await expectPartyAt(ruth.page, 12, 15);
    const door = await openQuickAction(ruth.page, 'Change a door');
    await door.getByRole('button', { name: 'Pick a door on the map' }).press('Enter');
    await expect(ruth.page.getByText(DOOR_PROMPT)).toBeVisible();
    await showKeyboardCursor(ruth.page);
    await expect(mapAnnouncement(ruth.page, /^North side: a door, closed\./)).toBeAttached();
    await ruth.page.keyboard.press('ArrowUp');
    await ruth.page.keyboard.press('e');
    await ruth.page.keyboard.press('e');
    await expect(
      mapAnnouncement(
        ruth.page,
        /^South side: a door, closed\. Chapter house(, not yet seen by the party)?, 1 square north of the party\./,
      ),
    ).toBeAttached();
    await ruth.page.keyboard.press('Enter');
    await expect(ruth.page.getByText(DOOR_PROMPT)).toHaveCount(0);
    await expect(door.getByRole('spinbutton', { name: 'Column' })).toHaveValue('12');
    await expect(door.getByRole('spinbutton', { name: 'Row' })).toHaveValue('14');
    await door.getByRole('radiogroup', { name: 'Open' }).getByRole('radio', { name: 'Yes' }).click();
    await door.getByRole('button', { name: 'Set door' }).press('Enter');
    await expect
      .poll(async () => JSON.stringify((await ruth.client.getRefereeState(table.id)).dungeon_state.doors))
      .toMatch(/"priory:1:(12,14:south|12,15:north)":\{"open":true/);
    await openScene(sam.page);
    await expect(scenePanel(sam.page).getByText('A door to the north is open.')).toBeVisible();
    await ruth.page.screenshot({ path: `${SCREENS_DIR}/map-keyboard-door.png` });
  });

  test('the ruler and a ping state their result in words', async ({ crew }) => {
    const { sam, ruth } = await dungeonTable(crew, { seed: 1981 });
    const tools = sam.page.getByRole('toolbar', { name: 'Map tools' });

    // The ruler with the keyboard: Enter starts at the cursor, the arrow keys move the far end, Enter keeps it.
    await tools.getByRole('button', { name: 'Measure' }).click();
    await showKeyboardCursor(sam.page);
    await expect(
      mapAnnouncement(sam.page, /the party's square\..* Press Enter to measure from here\./),
    ).toBeAttached();
    await sam.page.keyboard.press('Enter');
    for (let step = 0; step < 3; step += 1) await sam.page.keyboard.press('ArrowUp');
    await expect(mapAnnouncement(sam.page, /^3 squares, 30 feet\. /)).toBeAttached();
    await expect(sam.page.getByText('3 squares, 30 feet', { exact: true })).toBeVisible();
    await sam.page.keyboard.press('Enter');
    await expect(mapAnnouncement(sam.page, 'Kept: 3 squares, 30 feet.')).toBeAttached();
    await expectPartyAt(sam.page, 14, 23);
    await sam.page.keyboard.press('Escape');

    // The ruler with the pointer: the line above the map states the distance while the drag runs.
    const box = await dungeonMap(sam.page).boundingBox();
    if (box === null) throw new Error('The dungeon map is not on screen.');
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await sam.page.mouse.move(centre.x, centre.y);
    await sam.page.mouse.down();
    await sam.page.mouse.move(centre.x, centre.y - 80, { steps: 6 });
    // The map also announces a pointer measurement, a quarter of a second after the drag settles, in the same
    // words. Look at the status line, not the live region.
    await expect(sam.page.locator('span', { hasText: /^2 squares, 20 feet$/ })).toBeVisible();
    await sam.page.mouse.up();
    await sam.page.screenshot({ path: `${SCREENS_DIR}/map-ruler.png` });

    // A ping from the keyboard. The referee hears who pinged.
    await tools.getByRole('button', { name: 'Ping' }).click();
    await showKeyboardCursor(sam.page);
    await expect(
      mapAnnouncement(sam.page, /the party's square\..* Press Enter to ping here\./),
    ).toBeAttached();
    await sam.page.keyboard.press('Enter');
    await expect(mapAnnouncement(ruth.page, /^Sam pinged the map\./)).toBeAttached();
  });
});

test.describe('pins', () => {
  test('a player adds a pin from the Pins list, and the referee finds and reads it there', async ({
    crew,
  }) => {
    const { sam, ruth, table } = await dungeonTable(crew, { seed: 1981 });
    const level = { dungeon_id: 'priory', level_number: 1 };

    // Sam opens the empty list and pins the party's square.
    const samsPins = mapOptions(sam.page).getByRole('button', { name: /^Pins: / });
    await expect(samsPins).toHaveAccessibleName('Pins: 0 on this level');
    await samsPins.click();
    const samsList = sam.page.getByRole('region', { name: 'Pins on this level' });
    await expect(samsList.getByText('No pins on this level yet.')).toBeVisible();
    await samsList.getByRole('button', { name: 'Add pin at party' }).click();
    const addPin = sam.page.getByRole('dialog', { name: 'Add pin' });
    await expect(addPin).toHaveAccessibleDescription(
      'Everyone at the table can see this pin and its note on this level.',
    );
    await addPin.getByRole('textbox', { name: 'Note' }).fill('The statue hides a loose step');
    await addPin.getByRole('button', { name: 'Add pin' }).click();
    await expect(addPin).toHaveCount(0);
    await expect(samsPins).toHaveAccessibleName('Pins: 1 on this level');
    const stored = (await sam.client.getAnnotations(table.id, level)).items.filter((a) => a.kind === 'pin');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ x: 14.5, y: 23.5, text: 'The statue hides a loose step' });

    // Ruth's screen reader hears the new pin, and her list has it.
    await expect(
      mapAnnouncement(ruth.page, /^Sam added pin 1: The statue hides a loose step/),
    ).toBeAttached();
    const ruthsPins = mapOptions(ruth.page).getByRole('button', { name: /^Pins: / });
    await expect(ruthsPins).toHaveAccessibleName('Pins: 1 on this level');

    // With the keyboard: the toggle opens the list, Tab reaches each pin's buttons, and each item reads as text.
    await ruthsPins.press('Enter');
    const ruthsList = ruth.page.getByRole('region', { name: 'Pins on this level' });
    const item = ruthsList.getByRole('list', { name: 'Pins on this level' }).getByRole('listitem');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('The statue hides a loose step');
    await expect(item).toContainText('Pin 1, placed by Sam');
    await ruth.page.keyboard.press('Tab');
    await expect(item.getByRole('button', { name: 'Show pin 1 on the map' })).toBeFocused();
    await ruth.page.keyboard.press('Tab');
    await expect(item.getByRole('button', { name: 'Open pin 1' })).toBeFocused();
    await ruth.page.screenshot({ path: `${SCREENS_DIR}/map-pins-list.png` });
    await ruth.page.keyboard.press('Enter');
    const pin = ruth.page.getByRole('dialog', { name: 'Pin 1' });
    await expect(pin).toContainText('The statue hides a loose step');
    await expect(pin).toHaveAccessibleDescription('Placed by Sam.');
    await ruth.page.keyboard.press('Escape');
    await expect(pin).toHaveCount(0);

    // "Show" pans to the pin and gives the map focus.
    await ruthsPins.click();
    await ruthsList.getByRole('button', { name: 'Show pin 1 on the map' }).click();
    await expect(dungeonMap(ruth.page)).toBeFocused();

    // A pin that only referees see: the dialog says so (D-405), and Sam's list never gets it.
    await ruthsPins.click();
    await ruthsList.getByRole('button', { name: 'Add pin at party' }).click();
    const refereePin = ruth.page.getByRole('dialog', { name: 'Add pin' });
    await refereePin.getByRole('textbox', { name: 'Note' }).fill('Kobold scouts watch this stair');
    await refereePin.getByRole('checkbox', { name: 'Visible only to referees' }).check();
    await expect(refereePin).toHaveAccessibleDescription(
      'Only referees can see this pin and its note. Players never receive it.',
    );
    await refereePin.getByRole('button', { name: 'Add pin' }).click();
    await expect(refereePin).toHaveCount(0);
    await expect(ruthsPins).toHaveAccessibleName('Pins: 2 on this level');
    await ruthsPins.click();
    await expect(ruthsList.getByRole('listitem').filter({ hasText: 'Kobold scouts' })).toContainText(
      'Referees only',
    );
    await sam.page.waitForTimeout(800);
    await expect(samsPins).toHaveAccessibleName('Pins: 1 on this level');
    await samsPins.click();
    await expect(samsList).not.toContainText('Kobold scouts');
  });
});

test.describe('map chrome', () => {
  test('the minimap folds and unfolds, and starts folded on a narrow screen', async ({ crew }) => {
    const { sam, ruth } = await dungeonTable(crew, { seed: 1981 });
    const minimap = sam.page.getByRole('application', { name: MINIMAP });
    await expect(minimap).toBeVisible();
    await sam.page.getByRole('button', { name: 'Collapse minimap' }).click();
    await expect(minimap).toHaveCount(0);
    const show = sam.page.getByRole('button', { name: 'Show minimap' });
    await expect(show).toBeVisible();
    // The browser remembers the choice.
    await sam.page.reload();
    await expect(dungeonMap(sam.page)).toBeVisible();
    await expect(show).toBeVisible();
    await show.click();
    await expect(minimap).toBeVisible();
    await expect(sam.page.getByRole('button', { name: 'Collapse minimap' })).toBeVisible();

    // Below 1100 pixels the minimap starts folded, until the user unfolds it.
    await ruth.page.setViewportSize({ width: 1000, height: 800 });
    await ruth.page.reload();
    await expect(dungeonMap(ruth.page)).toBeVisible();
    await expect(ruth.page.getByRole('button', { name: 'Show minimap' })).toBeVisible();
    await expect(ruth.page.getByRole('application', { name: MINIMAP })).toHaveCount(0);
    await ruth.page.screenshot({ path: `${SCREENS_DIR}/map-narrow-minimap-folded.png` });
    await ruth.page.getByRole('button', { name: 'Show minimap' }).click();
    await expect(ruth.page.getByRole('application', { name: MINIMAP })).toBeVisible();
    await ruth.page.screenshot({ path: `${SCREENS_DIR}/map-narrow-minimap-open.png` });
  });

  test('the scene panel folds to its title bar, and its menu offers what is there', async ({ crew }) => {
    const { sam, ruth, table } = await dungeonTable(crew, { seed: 1981 });
    const scene = scenePanel(sam.page);

    // A new area opens the card and announces the area as a sentence (D-203).
    await placeParty(ruth.client, table.id, { dungeon: 'priory', level: 1, x: 12, y: 12, facing: 'north' });
    await expect(scene.getByRole('heading', { name: 'Chapter house' })).toBeVisible();
    await expect(scene.getByRole('button', { name: 'Collapse description' })).toBeVisible();
    await expect(scene.getByText('The party enters the chapter house.')).toBeAttached();

    // A press on the map folds it: the user has turned to the map.
    await clickSquare(sam.page, 4, 4);
    await expect(scene.getByRole('button', { name: 'Show description' })).toBeVisible();

    // In a corridor below the chapter house, the folded bar's menu opens the door.
    await placeParty(ruth.client, table.id, { dungeon: 'priory', level: 1, x: 12, y: 15, facing: 'north' });
    await expect(scene.getByRole('heading', { name: 'On the way' })).toBeVisible();
    const things = scene.getByRole('button', { name: /^\d+ things? here$/ });
    await expect(things).toBeVisible();
    await sam.page.screenshot({ path: `${SCREENS_DIR}/scene-folded.png` });
    await pickFromMenu(things, 'Door to the north', 'Open door');
    await openScene(sam.page);
    await expect(scene.getByText('A door to the north is open.')).toBeVisible();
  });
});
