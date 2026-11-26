/**
 * Encounters and battle: meeting monsters by walking into a keyed room, talking, fleeing with pursuit, turning
 * undead, declaring for each player's own members, a refused declaration, playback, a single-target spell at one
 * monster, a party member dying, victory with its summary, a total party kill reaching the end screen, and a thief
 * who hides in the back rank and back-stabs the next round.
 *
 * Every game uses a fixed session seed, so each fight repeats. The tests assert on what the table sees, never on
 * a particular die roll.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test, type Crew } from './support/fixtures';
import {
  battleBoard,
  combatTable,
  declarationRow,
  declareCloseIn,
  declareHold,
  declareSuggested,
  declaring,
  encounterPanel,
  fightThroughSdk,
  openFeed,
  stepParty,
  walkIntoGuardroom,
  walkIntoWardensCell,
} from './support/combat';
import { SCREENS_DIR } from './support/env';
import {
  ADVENTURES,
  enterDungeon,
  openTable,
  placeParty,
  send,
  setupTable,
  waitForGame,
} from './support/table';

/** Saves a screenshot for the defect report. */
const shot = (page: Page, name: string) => page.screenshot({ path: `${SCREENS_DIR}/combat-${name}.png` });

test.describe('encounters', () => {
  test('walking into a keyed room opens an encounter for the whole table, and the caller talks', async ({
    crew,
  }) => {
    const table = await combatTable(crew);
    const { sam, ann, ruth } = table;
    for (const actor of [sam, ann, ruth]) await openTable(actor.page, table.path);

    // Sam is the caller. He walks north from the entrance with the arrow keys.
    // The client drops a key press while a move is still in flight, so wait for each step to show on the map.
    for (let step = 1; step <= 3; step += 1) await stepParty(sam.page, 'ArrowUp', [14, 23 - step]);

    for (const actor of [sam, ann, ruth]) {
      await expect(
        encounterPanel(actor.page).getByRole('heading', { name: 'The party meets 2 goblins' }),
      ).toBeVisible();
      await expect(actor.page.getByRole('banner').getByText('Encounter', { exact: true })).toBeVisible();
    }
    await shot(sam.page, 'encounter-caller');
    // The panel and the action bar offer the same four choices under the same labels (D-016).
    const bar = sam.page.getByRole('toolbar', { name: 'Party actions' });
    const panelChoices = encounterPanel(sam.page).getByRole('list', { name: 'Encounter actions' });
    for (const label of ['Talk', 'Wait', 'Flee', 'Fight']) {
      await expect(panelChoices.getByRole('button', { name: label, exact: true })).toBeVisible();
      await expect(bar.getByRole('button', { name: new RegExp(`^${label}\\b`) })).toBeVisible();
    }
    // Only the caller and the referee act for the party. Ann sees why her buttons are off, in one sentence above
    // the choices, and each choice keeps its own explanation (R-306). Each button says why on hover and focus.
    const annPanel = encounterPanel(ann.page);
    const annChoices = annPanel.getByRole('list', { name: 'Encounter actions' });
    await expect(annChoices.getByRole('button', { name: 'Fight' })).toBeDisabled();
    await expect(annChoices.getByRole('button', { name: 'Fight' })).toHaveAccessibleDescription(
      'Only the caller can start a battle. Sam is the caller.',
    );
    const reason = 'Only the caller can act for the party. Sam is the caller.';
    await expect(annPanel.getByText(reason, { exact: true })).toHaveCount(1);
    await expect(annChoices).not.toContainText('Only the caller');
    await expect(annChoices).toContainText(
      'Engage in battle. Everyone declares an action before each round resolves.',
    );
    await expect(annChoices.getByRole('button', { name: 'Turn undead' })).toBeDisabled();
    await shot(ann.page, 'encounter-not-caller');

    // Sam talks, choosing who speaks.
    const samChoices = encounterPanel(sam.page).getByRole('list', { name: 'Encounter actions' });
    const before = (await sam.client.getGame(table.tableId)).revision;
    await samChoices.getByRole('button', { name: 'Talk' }).click();
    // The popover is a dialog named by its title (D-303), and the speakers are options of a list box.
    await sam.page
      .getByRole('dialog', { name: 'Choose a speaker' })
      .getByRole('option', { name: /^Clarence/ })
      .click();
    await waitForGame(sam.client, table.tableId, (game) => game.revision > before, 'the parley to apply');
    // The talk entry names the speaker and the monsters (D-304).
    const feed = await openFeed(ann.page);
    await expect(feed).toContainText('Clarence talks to the goblins.');
    await expect(encounterPanel(ann.page).or(battleBoard(ann.page)).first()).toBeVisible();
  });

  test('fleeing from hostile monsters starts a pursuit that the caller can keep running', async ({
    crew,
  }) => {
    // With seed 2, three zombies that the referee brings in are hostile and give chase.
    const table = await combatTable(crew, { seed: 2 });
    const { sam, ann, ruth, tableId } = table;
    await send(ruth.client, tableId, {
      command_type: 'spawn_monsters',
      template_id: 'zombie',
      count_fixed: 3,
      distance_feet: 90,
    });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);
    const panel = encounterPanel(sam.page);
    await expect(panel.getByRole('heading', { name: 'The party meets 3 zombies' })).toBeVisible();

    await panel
      .getByRole('list', { name: 'Encounter actions' })
      .getByRole('button', { name: 'Flee' })
      .click();
    await sam.page
      .getByRole('dialog', { name: 'Flee' })
      .getByRole('option', { name: /^Run\b/ })
      .click();

    for (const actor of [sam, ann]) {
      const chase = encounterPanel(actor.page);
      await expect(chase.getByRole('heading', { name: 'The zombies give chase' })).toBeVisible();
      await expect(chase.getByText(/^The pursuers are \d+ feet behind$/)).toBeVisible();
    }
    await shot(sam.page, 'pursuit');
    const choices = panel.getByRole('list', { name: 'Encounter actions' });
    await expect(choices.getByRole('button', { name: 'Talk' })).toHaveCount(0);
    await expect(choices.getByRole('button', { name: 'Turn and fight' })).toBeEnabled();
    const before = (await sam.client.getGame(tableId)).revision;
    await choices.getByRole('button', { name: 'Keep running' }).click();
    await waitForGame(sam.client, tableId, (game) => game.revision > before, 'a round of the chase');
    await expect(encounterPanel(ann.page).or(battleBoard(ann.page)).first()).toBeVisible();
  });

  test('the cleric turns undead from the encounter panel', async ({ crew }) => {
    // With seed 4, three skeletons appear without attacking, and Clarence's turning destroys them.
    const table = await combatTable(crew, { seed: 4 });
    const { sam, ann, ruth, tableId } = table;
    await send(ruth.client, tableId, {
      command_type: 'spawn_monsters',
      template_id: 'skeleton',
      count_fixed: 3,
      distance_feet: 90,
    });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // Turning is a member's act, so Ann, who plays Clarence, can do it although she isn't the caller.
    const choices = encounterPanel(ann.page).getByRole('list', { name: 'Encounter actions' });
    const turn = choices.getByRole('button', { name: 'Turn undead' });
    await expect(turn).toBeEnabled();
    await turn.click();
    await waitForGame(
      ann.client,
      tableId,
      (game) => game.mode !== 'encounter',
      'the turning to end the encounter',
    );

    // The encounter is over, and the after-fight summary says what happened.
    for (const actor of [sam, ann]) {
      await expect(encounterPanel(actor.page)).toHaveCount(0);
      const feed = await openFeed(actor.page);
      await expect(feed).toContainText(/Clarence/);
      await expect(feed).toContainText(/skeleton/i);
    }
  });
});

test.describe('waiting on indifferent monsters', () => {
  /** Brings a Toll party to the counting room, where the clerk and his bandit pay the party no mind. */
  async function countingRoom(crew: Crew) {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const ann = await crew.person('Ann');
    const setup = await setupTable({
      referee: ruth,
      players: [sam, ann],
      party: [
        { owner: sam, name: 'Flarg', classId: 'fighter' },
        { owner: sam, name: 'Clarence', classId: 'cleric' },
        { owner: ann, name: 'Mazpar', classId: 'magic_user' },
        { owner: ann, name: 'Elfy', classId: 'elf' },
      ],
      adventure: ADVENTURES.toll,
    });
    const tableId = setup.table.id;
    await enterDungeon(sam.client, tableId, 'bridge');
    await placeParty(ruth.client, tableId, { dungeon: 'bridge', level: 1, x: 12, y: 5, facing: 'north' });
    await send(sam.client, tableId, { command_type: 'open_door', direction: 'north' });
    const game = await send(sam.client, tableId, { command_type: 'move_party', direction: 'north' });
    expect(game.view.encounter?.stance).toBe('indifferent');
    for (const actor of [sam, ann]) await openTable(actor.page, setup.path);
    return { ruth, sam, ann, tableId };
  }

  test('the encounter panel says what a wait did, for the caller and the other player (R-517)', async ({
    crew,
  }) => {
    const { sam, ann, tableId } = await countingRoom(crew);
    const before = (await sam.client.getGame(tableId)).revision;
    await encounterPanel(sam.page)
      .getByRole('list', { name: 'Encounter actions' })
      .getByRole('button', { name: 'Wait' })
      .click();
    await waitForGame(sam.client, tableId, (game) => game.revision > before, 'the wait to apply');
    for (const actor of [sam, ann])
      await expect(encounterPanel(actor.page)).toContainText(/The party waits\. \S/);
    await shot(ann.page, 'wait-indifferent');
  });

  test('the feed says that the party waited a round (F-103)', async ({ crew }) => {
    const { sam, ann, tableId } = await countingRoom(crew);
    const before = (await sam.client.getGame(tableId)).revision;
    await encounterPanel(sam.page)
      .getByRole('list', { name: 'Encounter actions' })
      .getByRole('button', { name: 'Wait' })
      .click();
    await waitForGame(sam.client, tableId, (game) => game.revision > before, 'the wait to apply');
    await expect(await openFeed(ann.page)).toContainText(/The party waits\./);
  });
});

test.describe('console errors fixed in the first round', () => {
  // D-311: the dialog's description nested a paragraph and a checkbox inside a paragraph, and React logged it.
  test('the referee ends an encounter by coming to terms without a console error', async ({ crew }) => {
    const table = await combatTable(crew);
    const { ruth, sam, tableId } = table;
    await walkIntoGuardroom(sam.client, tableId);
    await openTable(ruth.page, table.path);
    const panel = encounterPanel(ruth.page);
    await panel.getByText('Monsters and referee tools').click();
    await panel.getByRole('button', { name: 'End in parley' }).click();
    const dialog = ruth.page.getByRole('alertdialog', { name: 'End encounter in parley with the goblins?' });
    await dialog.getByRole('checkbox', { name: 'Mark area encounter resolved' }).click();
    await dialog.getByRole('button', { name: 'End encounter' }).click();
    await expect(panel).toHaveCount(0);
  });

  // D-310: the composer looked up `monsters/<family_id>`, and a family such as `veteran` isn't a catalog entry.
  test('declaring against a monster whose family isn’t a catalog entry requests nothing that fails', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const setup = await setupTable({
      referee: ruth,
      players: [sam],
      party: [{ owner: sam, name: 'Flarg', classId: 'fighter' }],
      adventure: ADVENTURES.toll,
    });
    const tableId = setup.table.id;
    await send(sam.client, tableId, { command_type: 'enter_dungeon', dungeon_id: 'bridge' });
    await send(ruth.client, tableId, {
      command_type: 'spawn_monsters',
      template_id: 'veteran_2',
      count_fixed: 1,
      distance_feet: 20,
    });
    const game = await sam.client.getGame(tableId);
    if (game.mode === 'encounter') await send(sam.client, tableId, { command_type: 'engage_battle' });
    await openTable(sam.page, setup.path);
    await declarationRow(sam.page, 'Flarg')
      .getByRole('button', { name: /^(Actions|Change)/ })
      .click();
    await expect(sam.page.getByRole('region', { name: 'Declare for Flarg' })).toBeVisible();
  });
});

test.describe('battle', () => {
  test('two players declare for their own members, see each other’s choices, and watch the round play back', async ({
    crew,
  }) => {
    // This test is about playback, so everyone watches at the normal pace.
    const table = await combatTable(crew, { playbackSpeed: 'normal' });
    const { sam, ann, ruth, tableId } = table;
    await walkIntoGuardroom(sam.client, tableId);
    for (const actor of [sam, ann, ruth]) await openTable(actor.page, table.path);

    await encounterPanel(sam.page).getByRole('button', { name: 'Fight' }).click();
    for (const actor of [sam, ann, ruth]) {
      await expect(battleBoard(actor.page).getByRole('heading', { name: 'Round 1' })).toBeVisible();
      // The top bar and the board agree on the round (D-012).
      await expect(actor.page.getByRole('banner')).toContainText(/Round\s*1(?!\d)/);
    }

    // Each player declares only for their own seats.
    await expect(declarationRow(sam.page, 'Clarence')).toContainText('Waiting for Ann');
    await expect(declarationRow(sam.page, 'Clarence').getByRole('button')).toHaveCount(0);
    await expect(declarationRow(ann.page, 'Flarg')).toContainText('Waiting for Sam');

    await declaring(sam.page, () =>
      declarationRow(sam.page, 'Flarg').getByRole('button', { name: 'Close in on the goblins' }).click(),
    );
    // Ann sees Sam's plan for Flarg, because the party plans together.
    await expect(declarationRow(ann.page, 'Flarg')).toContainText('Close in on the goblins');
    await expect(battleBoard(ann.page)).toContainText('1 of 4 declared');

    // Ann opens Mazpar's choices. Her dagger is thrown, so the attack reads as a throw (D-301).
    await declarationRow(ann.page, 'Mazpar').getByRole('button', { name: 'Actions' }).click();
    const composer = ann.page.getByRole('region', { name: 'Declare for Mazpar' });
    await expect(composer.getByRole('radio', { name: 'Attack' })).toBeChecked();
    await expect(composer.getByRole('button', { name: 'Throw: the goblins, 30 feet away' })).toBeVisible();
    await expect(composer).not.toContainText(/shoot/i);
    // She aims her magic missile at the second goblin instead.
    await composer
      .getByRole('radiogroup', { name: 'What Mazpar does this round' })
      .getByRole('radio', { name: 'Cast' })
      .click();
    await composer.getByRole('group', { name: 'Monsters' }).getByRole('button', { name: 'Goblin 2' }).click();
    await declaring(ann.page, () =>
      composer.getByRole('button', { name: 'Cast magic missile at Goblin 2' }).click(),
    );
    await expect(declarationRow(sam.page, 'Mazpar')).toContainText(/magic missile/i);
    await expect(declarationRow(sam.page, 'Mazpar')).toContainText('Goblin 2');
    await expect(battleBoard(sam.page)).not.toContainText(/monster-\d/);
    await shot(ann.page, 'battle-declaring');

    // The board opens the next undeclared member's choices for Ann: Clarence's.
    const clarence = ann.page.getByRole('region', { name: 'Declare for Clarence' });
    // Clarence stands in the back rank with no missile weapon, so the board suggests that he holds (F-207), and Ann
    // sends him in by choice.
    await expect(clarence).toBeVisible();
    await declareCloseIn(ann.page, 'Clarence', 'the goblins');
    await declaring(sam.page, () =>
      declarationRow(sam.page, 'Tinks')
        .getByRole('button', { name: /^Attack the goblins/ })
        .click(),
    );

    // The last declaration resolves the round by itself, and each page plays it back. Sam pauses his own
    // playback and steps through it by keyboard.
    const board = battleBoard(sam.page);
    await expect(board.getByRole('button', { name: 'Pause playback' })).toBeVisible({ timeout: 30_000 });
    await sam.page.keyboard.press('k');
    await expect(board.getByText('Paused', { exact: true })).toBeVisible();
    const beat = board.getByRole('status').first();
    const before = await beat.innerText();
    await sam.page.keyboard.press('.');
    await expect(beat).not.toHaveText(before);
    await sam.page.keyboard.press(',');
    await expect(beat).toHaveText(before);
    // Sam's pause holds up nobody else: everyone else's playback ends, and they see the next round.
    for (const actor of [ann, ruth]) {
      await expect(battleBoard(actor.page).getByRole('heading', { name: 'Round 2' })).toBeVisible({
        timeout: 30_000,
      });
    }
    await expect(board.getByRole('heading', { name: 'Round 1' })).toBeVisible();
    await expect(board).toContainText(/0 of \d declared for round 2/);
    await board.getByRole('button', { name: 'Skip' }).click();
    await expect(board.getByRole('heading', { name: 'Round 2' })).toBeVisible();
    // When the playback ends, the board sums the round up, and anyone can replay it at another speed.
    await expect(board.getByText('Round 1 result')).toBeVisible();
    await board.getByRole('button', { name: 'Replay' }).click();
    await board.getByRole('button', { name: 'Playback speed: Normal' }).click();
    await sam.page.getByRole('menuitemcheckbox', { name: 'Very fast' }).click();
    await shot(sam.page, 'battle-playback');
    await expect(board.getByRole('button', { name: 'Playback speed: Very fast' })).toBeVisible();
    await board.getByRole('button', { name: 'Skip' }).click();
    await expect(board.getByText('Round 1 result')).toBeVisible();
    const feed = await openFeed(sam.page);
    await expect(feed).toContainText(/magic missile/i);
    await expect(feed).toContainText(/Mazpar/);
  });

  test('a declaration that bxapi refuses is shown to the table, and changing it resolves the round', async ({
    crew,
  }) => {
    const table = await combatTable(crew, { autoResolve: false });
    const { sam, ann, tableId, memberId } = table;
    const game = await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // Sam's stale plan from another tab: Flarg attacks the goblins without closing the 30 feet to them.
    const goblins = game.view.encounter?.groups[0]?.id ?? '';
    await sam.client.declare(tableId, memberId('Flarg'), { action: 'attack', target_group_id: goblins });
    await declaring(sam.page, () =>
      declarationRow(sam.page, 'Tinks')
        .getByRole('button', { name: /^Attack the goblins/ })
        .click(),
    );
    await declareCloseIn(ann.page, 'Clarence', 'the goblins');
    await declaring(ann.page, () =>
      declarationRow(ann.page, 'Mazpar')
        .getByRole('button', { name: /^(Attack|Shoot|Throw)/ })
        .first()
        .click(),
    );
    await expect(battleBoard(sam.page)).toContainText('4 of 4 declared');

    // The server previews the declarations, so both players see which action won't work and why, on Flarg's
    // row, and the round can't resolve until Flarg's action changes.
    for (const actor of [sam, ann]) {
      await expect(declarationRow(actor.page, 'Flarg')).toContainText(/Won't work: /);
      await expect(declarationRow(actor.page, 'Flarg')).toContainText(/too far for a melee attack/);
      await expect(battleBoard(actor.page).getByRole('heading', { name: 'Round 1' })).toBeVisible();
    }
    await expect(battleBoard(sam.page).getByRole('button', { name: 'Resolve round' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await shot(ann.page, 'refused-declaration');

    // Sam changes Flarg's declaration to closing in, and the round resolves.
    await declarationRow(sam.page, 'Flarg').getByRole('button', { name: 'Change' }).click();
    const composer = sam.page.getByRole('region', { name: 'Declare for Flarg' });
    await composer.getByRole('radio', { name: 'Move' }).click();
    await declaring(sam.page, () =>
      composer.getByRole('button', { name: 'Close in on the goblins' }).click(),
    );
    await battleBoard(sam.page).getByRole('button', { name: 'Resolve round' }).click();
    await expect(battleBoard(ann.page).getByRole('heading', { name: 'Round 2' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('a magic missile at Gashnak One-Ear names him in the target list and in the feed', async ({
    crew,
  }) => {
    const table = await combatTable(crew);
    const { sam, ann, tableId } = table;
    const game = await walkIntoWardensCell(table);
    if (game.mode === 'encounter') await send(sam.client, tableId, { command_type: 'engage_battle' });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // The board names Gashnak by his own label, without an article or a count.
    await expect(battleBoard(ann.page)).toContainText('Gashnak One-Ear');
    await declarationRow(ann.page, 'Mazpar').getByRole('button', { name: 'Actions' }).click();
    const composer = ann.page.getByRole('region', { name: 'Declare for Mazpar' });
    await composer.getByRole('radio', { name: 'Cast' }).click();
    const monsters = composer.getByRole('group', { name: 'Monsters' });
    await expect(monsters.getByRole('button', { name: 'Gashnak One-Ear', exact: true })).toBeVisible();
    await expect(monsters.getByRole('button', { name: /^Goblin \d$/ })).toHaveCount(2);
    await monsters.getByRole('button', { name: 'Gashnak One-Ear', exact: true }).click();
    await shot(ann.page, 'spell-at-gashnak');
    await declaring(ann.page, () =>
      composer.getByRole('button', { name: 'Cast magic missile at Gashnak One-Ear' }).click(),
    );
    await expect(declarationRow(sam.page, 'Mazpar')).toContainText(/magic missile at Gashnak One-Ear/i);

    // Everyone else holds, and the round resolves.
    const before = (await sam.client.getGame(tableId)).revision;
    for (const [actor, name] of [
      [sam, 'Flarg'],
      [sam, 'Tinks'],
      [ann, 'Clarence'],
    ] as const) {
      await actor.client.declare(tableId, table.memberId(name), { action: 'hold' });
    }
    await waitForGame(sam.client, tableId, (next) => next.revision > before, 'the round to resolve');
    const feed = await openFeed(sam.page);
    await expect(feed).toContainText(/Mazpar casts magic missile/i);
    await expect(feed.getByText(/magic missile/i).first()).toBeVisible();
    await expect(feed).toContainText(/Gashnak One-Ear/);
    await expect(feed).not.toContainText(/the Gashnak|Gashnak One-Ears|hobgoblin/i);
  });

  test('the board names a refused declaration before the round resolves, and the round waits for it', async ({
    crew,
  }) => {
    const table = await combatTable(crew, { autoResolve: false });
    const { sam, tableId, memberId } = table;
    const game = await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    const goblins = game.view.encounter?.groups[0]?.id ?? '';
    await sam.client.declare(tableId, memberId('Flarg'), { action: 'attack', target_group_id: goblins });
    for (const name of ['Tinks', 'Clarence', 'Mazpar']) {
      const client = name === 'Tinks' ? sam.client : table.ann.client;
      await client.declare(tableId, memberId(name), { action: 'hold' });
    }
    // The server previews the declarations as they arrive, so the board names Flarg's before anyone resolves.
    await openTable(sam.page, table.path);
    await expect(declarationRow(sam.page, 'Flarg')).toContainText(/too far for a melee attack/);
    // The board's button and the action bar's button both wait for Flarg.
    const resolveButtons = sam.page.getByRole('button', { name: 'Resolve round' });
    await expect(resolveButtons).toHaveCount(2);
    for (const button of await resolveButtons.all())
      await expect(button).toHaveAttribute('aria-disabled', 'true');
    const result = await sam.client.resolveRound(tableId);
    expect(result.accepted).toBe(false);
    expect(result.declarations?.refusals.map((refusal) => refusal.member_id)).toEqual([memberId('Flarg')]);
  });

  test('a party member dies, and the board and the party panel show it', async ({ crew }) => {
    const table = await combatTable(crew, { party: 'weak' });
    const { sam, ann, tableId } = table;
    await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // With this seed, the goblins kill Mazpar in the second round.
    const game = await fightThroughSdk(table, (next) =>
      next.view.party.some((member) => member.current_hp <= 0),
    );
    expect(game.mode).toBe('battle');
    const mazpar = game.view.party.find((member) => member.name === 'Mazpar');
    expect(mazpar?.current_hp).toBeLessThanOrEqual(0);

    for (const actor of [sam, ann]) {
      // The board and the party panel use the same word for a dead member (D-306).
      await expect(declarationRow(actor.page, 'Mazpar')).toContainText('Dead', { timeout: 30_000 });
      await expect(declarationRow(actor.page, 'Mazpar')).not.toContainText('Down');
      await expect(declarationRow(actor.page, 'Mazpar').getByRole('button')).toHaveCount(0);
      await expect(
        actor.page
          .getByRole('list', { name: 'Marching order' })
          .getByRole('button', { name: 'Mazpar', exact: true }),
      ).toHaveAccessibleDescription(/0 of 1 hit points.*dead/);
    }
    await expect(battleBoard(ann.page)).toContainText(/of 1 declared/);
    await shot(ann.page, 'member-down');
  });

  test('a total party kill ends the game, and everyone reaches the end screen', async ({ crew }) => {
    const table = await combatTable(crew, { party: 'weak' });
    const { sam, ann, ruth, tableId } = table;
    await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    for (const actor of [sam, ann, ruth]) await openTable(actor.page, table.path);

    const game = await fightThroughSdk(table);
    expect(game.mode).toBe('game_over');
    for (const actor of [sam, ann, ruth]) {
      await expect(actor.page.getByRole('heading', { name: 'The party has fallen', level: 2 })).toBeVisible({
        timeout: 30_000,
      });
      const party = actor.page.getByRole('list', { name: 'The party' });
      await expect(party.getByRole('listitem')).toHaveCount(2);
      await expect(party).toContainText('Flarg');
      await expect(party).toContainText('Mazpar');
    }
    await expect(ann.page.getByText('The referee decides what comes next')).toBeVisible();
    await shot(ann.page, 'end-screen-player');
    await shot(ruth.page, 'end-screen-referee');
    await expect(ruth.page.getByRole('button', { name: /lobby/i }).first()).toBeVisible();
  });

  test('the party wins through the board and sees the summary of the fight', async ({ crew }) => {
    const table = await combatTable(crew);
    const { sam, ann, tableId } = table;
    await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // Each player clicks the suggested action for each of their members, round after round.
    for (let round = 1; round <= 10; round += 1) {
      const game = await sam.client.getGame(tableId);
      if (game.mode !== 'battle') break;
      for (const actor of [sam, ann]) {
        await expect(battleBoard(actor.page)).toContainText(/(?<!\d)0 of \d declared/, { timeout: 30_000 });
      }
      for (const [actor, names] of [
        [sam, ['Flarg', 'Tinks']],
        [ann, ['Clarence', 'Mazpar']],
      ] as const) {
        for (const name of names) {
          // A caster's highlighted choice opens the spell list instead of declaring, so she holds this round. A
          // member who can't act, or whose choices are already open for another member, is left as it is.
          if (await declareSuggested(actor.page, name)) continue;
          const row = declarationRow(actor.page, name);
          const open = actor.page.getByRole('region', { name: `Declare for ${name}` });
          if ((await row.getByRole('button', { name: 'Actions' }).count()) > 0 || (await open.count()) > 0) {
            await declareHold(actor.page, name);
          }
        }
      }
      await waitForGame(
        sam.client,
        tableId,
        (next) => next.revision > game.revision,
        `round ${round} to resolve`,
      );
    }
    await waitForGame(sam.client, tableId, (game) => game.mode === 'exploring', 'the battle to end');

    for (const actor of [sam, ann]) {
      const summary = actor.page.getByRole('region', { name: 'The goblins are beaten' });
      await expect(summary).toBeVisible({ timeout: 30_000 });
      await expect(summary.getByRole('term').filter({ hasText: 'Defeated' })).toBeVisible({
        timeout: 30_000,
      });
      // The summary names what became of each goblin in words, such as "A goblin slain and a goblin routed".
      await expect(summary.getByRole('definition').first()).toContainText(/goblins? (slain|routed)/);
      await expect(summary.getByRole('term').filter({ hasText: 'Experience' })).toBeVisible();
      // The summary counts experience in experience points (D-307) and calls the coins dropped goods, as the
      // scene does (D-308).
      await expect(summary).toContainText(/worth \d+ experience points/);
      await expect(summary).toContainText('Dropped goods lie here.');
      await expect(summary.getByRole('button', { name: 'Pick up', exact: true })).toBeVisible();
      await expect(battleBoard(actor.page)).toHaveCount(0);
    }
    await shot(sam.page, 'aftermath-victory');
    await sam.page
      .getByRole('region', { name: 'The goblins are beaten' })
      .getByRole('button', { name: 'Close' })
      .click();
    await expect(sam.page.getByRole('region', { name: 'The goblins are beaten' })).toHaveCount(0);
  });
});

test.describe('hide in shadows and back-stab', () => {
  test('a thief in the back rank is offered Hide, the one in front isn’t, and the hidden thief can back-stab next round', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    // Two thieves: Tinks leads the march, and Wren walks behind Flarg.
    const setup = await setupTable({
      name: 'Two thieves',
      referee: ruth,
      players: [sam],
      party: [
        { owner: sam, name: 'Tinks', classId: 'thief', buy: ['leather', 'sword'] },
        { owner: sam, name: 'Flarg', classId: 'fighter' },
        { owner: sam, name: 'Wren', classId: 'thief', buy: ['leather', 'sword'] },
        { owner: sam, name: 'Clarence', classId: 'cleric' },
      ],
      seed: 1981,
      settings: { auto_resolve: true },
    });
    const tableId = setup.table.id;
    await enterDungeon(sam.client, tableId, 'priory');
    // The cloister walk is two abreast, so Tinks and Flarg form the front rank.
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 8, y: 12, facing: 'north' });
    let game = await send(ruth.client, tableId, {
      command_type: 'spawn_monsters',
      template_id: 'goblin',
      count_fixed: 2,
      distance_feet: 40,
    });
    if (game.mode === 'encounter') game = await send(sam.client, tableId, { command_type: 'engage_battle' });
    expect(game.mode).toBe('battle');
    const seat = (name: string): string => {
      const found = game.seats.find((candidate) => candidate.name === name);
      if (found === undefined) throw new Error(`Nobody named ${name} is in the party.`);
      return found.member_id;
    };
    await openTable(sam.page, setup.path);
    const board = battleBoard(sam.page);
    await expect(board).toBeVisible();

    const openChoices = async (name: string) => {
      const close = sam.page.getByRole('button', { name: /^Close .*'s actions$/ });
      if ((await close.count()) > 0) await close.first().click();
      await declarationRow(sam.page, name)
        .getByRole('button', { name: /^(Actions|Change)/ })
        .click();
      const composer = sam.page.getByRole('region', { name: `Declare for ${name}` });
      await expect(composer).toBeVisible();
      return composer;
    };
    const tabs = (composer: Locator, name: string) =>
      composer.getByRole('radiogroup', { name: `What ${name} does this round` });

    // Round 1: Tinks stands in the front rank, so she has no Hide tab. Wren has one.
    const tinks = await openChoices('Tinks');
    await expect(tabs(tinks, 'Tinks').getByRole('radio', { name: 'Attack' })).toBeVisible();
    await expect(tabs(tinks, 'Tinks').getByRole('radio', { name: 'Hide' })).toHaveCount(0);
    const wren = await openChoices('Wren');
    await tabs(wren, 'Wren').getByRole('radio', { name: 'Hide' }).click();
    await expect(wren).toContainText(
      'Wren slips into the shadows to set up a back-stab. The referee rolls in secret.',
    );
    // Nobody has hidden yet, so nobody is offered a back-stab.
    await tabs(wren, 'Wren').getByRole('radio', { name: 'Attack' }).click();
    await expect(wren.getByRole('checkbox', { name: /^Back-stab/ })).toHaveCount(0);
    await tabs(wren, 'Wren').getByRole('radio', { name: 'Hide' }).click();
    await declaring(sam.page, () => wren.getByRole('button', { name: 'Hide in shadows' }).click());
    await expect(declarationRow(sam.page, 'Wren')).toContainText('Hide in shadows');

    // The rest of the party holds, and the round resolves.
    const before = (await sam.client.getGame(tableId)).revision;
    for (const name of ['Tinks', 'Flarg', 'Clarence']) {
      await sam.client.declare(tableId, seat(name), { action: 'hold' });
    }
    game = await waitForGame(sam.client, tableId, (next) => next.revision > before, 'round 1 to resolve');
    expect(game.mode).toBe('battle');
    await expect(board.getByRole('heading', { name: 'Round 2' })).toBeVisible({ timeout: 30_000 });

    // Round 2: Wren is hiding, so her attack offers a back-stab, checked. Tinks's doesn't.
    const wrenAgain = await openChoices('Wren');
    await tabs(wrenAgain, 'Wren').getByRole('radio', { name: 'Attack' }).click();
    const backStab = wrenAgain.getByRole('checkbox', { name: /^Back-stab/ });
    await expect(backStab).toBeVisible();
    await expect(backStab).toBeChecked();
    await expect(wrenAgain).toContainText("Strike a monster that hasn't noticed Wren.");
    const tinksAgain = await openChoices('Tinks');
    await tabs(tinksAgain, 'Tinks').getByRole('radio', { name: 'Attack' }).click();
    await expect(tinksAgain.getByRole('checkbox', { name: /^Back-stab/ })).toHaveCount(0);
    await expect(tabs(tinksAgain, 'Tinks').getByRole('radio', { name: 'Hide' })).toHaveCount(0);
  });
});
