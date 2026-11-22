/**
 * Encounters and battle: meeting monsters by walking into a keyed room, talking, fleeing with pursuit, turning
 * undead, declaring for each player's own members, a refused declaration, playback, a single-target spell at one
 * monster, a party member dying, victory with its summary, and a total party kill reaching the end screen.
 *
 * Every game uses a fixed session seed, so each fight repeats. The tests assert on what the table sees, never on
 * a particular die roll.
 */
import type { Page } from '@playwright/test';
import { expect, test, type Crew } from './support/fixtures';
import {
  battleBoard,
  combatTable,
  declarationRow,
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
    const panelChoices = encounterPanel(sam.page).getByRole('list', { name: "The party's choices" });
    for (const label of ['Talk', 'Wait', 'Flee', 'Fight']) {
      await expect(panelChoices.getByRole('button', { name: label, exact: true })).toBeVisible();
      await expect(bar.getByRole('button', { name: new RegExp(`^${label}\\b`) })).toBeVisible();
    }
    // Only the caller and the referee act for the party. Ann sees why her buttons are off, in one sentence above
    // the choices, and each choice keeps its own explanation (R-306).
    const annPanel = encounterPanel(ann.page);
    const annChoices = annPanel.getByRole('list', { name: "The party's choices" });
    await expect(annChoices.getByRole('button', { name: 'Fight' })).toBeDisabled();
    const reason = 'Sam is the caller, so Sam or the referee chooses for the party.';
    await expect(annPanel.getByText(reason, { exact: true })).toHaveCount(1);
    await expect(annChoices).not.toContainText('Only the caller');
    await expect(annChoices).toContainText(
      'Start a battle. Everyone declares, and the round resolves together.',
    );
    await expect(annChoices.getByRole('button', { name: 'Turn undead' })).toBeDisabled();
    await shot(ann.page, 'encounter-not-caller');

    // Sam talks, choosing who speaks.
    const samChoices = encounterPanel(sam.page).getByRole('list', { name: "The party's choices" });
    const before = (await sam.client.getGame(table.tableId)).revision;
    await samChoices.getByRole('button', { name: 'Talk' }).click();
    // The popover is a dialog named by its title (D-303), and the speakers are options of a list box.
    await sam.page
      .getByRole('dialog', { name: 'Who speaks for the party?' })
      .getByRole('option', { name: /^Osric/ })
      .click();
    await waitForGame(sam.client, table.tableId, (game) => game.revision > before, 'the parley to apply');
    // The talk entry names the speaker and the monsters (D-304).
    const feed = await openFeed(ann.page);
    await expect(feed).toContainText('Osric talks to the goblins.');
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
      .getByRole('list', { name: "The party's choices" })
      .getByRole('button', { name: 'Flee' })
      .click();
    await sam.page
      .getByRole('dialog', { name: 'Flee' })
      .getByRole('option', { name: /^Just run/ })
      .click();

    for (const actor of [sam, ann]) {
      const chase = encounterPanel(actor.page);
      await expect(chase.getByRole('heading', { name: 'The zombies give chase' })).toBeVisible();
      await expect(chase.getByText(/^The pursuers are \d+ feet behind$/)).toBeVisible();
    }
    await shot(sam.page, 'pursuit');
    const choices = panel.getByRole('list', { name: "The party's choices" });
    await expect(choices.getByRole('button', { name: 'Talk' })).toHaveCount(0);
    await expect(choices.getByRole('button', { name: 'Turn and fight' })).toBeEnabled();
    const before = (await sam.client.getGame(tableId)).revision;
    await choices.getByRole('button', { name: 'Keep running' }).click();
    await waitForGame(sam.client, tableId, (game) => game.revision > before, 'a round of the chase');
    await expect(encounterPanel(ann.page).or(battleBoard(ann.page)).first()).toBeVisible();
  });

  test('the cleric turns undead from the encounter panel', async ({ crew }) => {
    // With seed 4, three skeletons appear without attacking, and Osric's turning destroys them.
    const table = await combatTable(crew, { seed: 4 });
    const { sam, ann, ruth, tableId } = table;
    await send(ruth.client, tableId, {
      command_type: 'spawn_monsters',
      template_id: 'skeleton',
      count_fixed: 3,
      distance_feet: 90,
    });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // Turning is a member's act, so Ann, who plays Osric, can do it although she isn't the caller.
    const choices = encounterPanel(ann.page).getByRole('list', { name: "The party's choices" });
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
      await expect(feed).toContainText(/Osric/);
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
        { owner: sam, name: 'Brenna', classId: 'fighter' },
        { owner: sam, name: 'Osric', classId: 'cleric' },
        { owner: ann, name: 'Tamsin', classId: 'magic_user' },
        { owner: ann, name: 'Wren', classId: 'elf' },
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
      .getByRole('list', { name: "The party's choices" })
      .getByRole('button', { name: 'Wait' })
      .click();
    await waitForGame(sam.client, tableId, (game) => game.revision > before, 'the wait to apply');
    const said = 'The party waits a round. The ink-stained clerk and the bandit pay the party no mind.';
    for (const actor of [sam, ann]) await expect(encounterPanel(actor.page)).toContainText(said);
    await shot(ann.page, 'wait-indifferent');
  });

  // F-103: the wait still leaves no line in the feed, so a look at the feed can't tell that a round passed.
  test.fixme('the feed says that the party waited a round (F-103)', async ({ crew }) => {
    const { sam, ann, tableId } = await countingRoom(crew);
    const before = (await sam.client.getGame(tableId)).revision;
    await encounterPanel(sam.page)
      .getByRole('list', { name: "The party's choices" })
      .getByRole('button', { name: 'Wait' })
      .click();
    await waitForGame(sam.client, tableId, (game) => game.revision > before, 'the wait to apply');
    await expect(await openFeed(ann.page)).toContainText(/waits a round/);
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
    await panel.getByRole('button', { name: 'They came to terms' }).click();
    const dialog = ruth.page.getByRole('alertdialog', { name: 'The party came to terms with the goblins' });
    await dialog.getByRole('checkbox', { name: "Keep this area's monsters peaceful" }).click();
    await dialog.getByRole('button', { name: 'End the encounter' }).click();
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
      party: [{ owner: sam, name: 'Brenna', classId: 'fighter' }],
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
    await declarationRow(sam.page, 'Brenna')
      .getByRole('button', { name: /^(More choices|Change)/ })
      .click();
    await expect(sam.page.getByRole('region', { name: 'Declare for Brenna' })).toBeVisible();
  });
});

test.describe('battle', () => {
  test('two players declare for their own members, see each other’s choices, and watch the round play back', async ({
    crew,
  }) => {
    const table = await combatTable(crew);
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
    await expect(declarationRow(sam.page, 'Osric')).toContainText('Waiting for Ann');
    await expect(declarationRow(sam.page, 'Osric').getByRole('button')).toHaveCount(0);
    await expect(declarationRow(ann.page, 'Brenna')).toContainText('Waiting for Sam');

    await declaring(sam.page, () =>
      declarationRow(sam.page, 'Brenna').getByRole('button', { name: 'Close in on the goblins' }).click(),
    );
    // Ann sees Sam's plan for Brenna, because the party plans together.
    await expect(declarationRow(ann.page, 'Brenna')).toContainText('Close in on the goblins');
    await expect(battleBoard(ann.page)).toContainText('1 of 4 declared');

    // Ann opens Tamsin's choices. Her dagger is thrown, so the attack reads as a throw (D-301).
    await declarationRow(ann.page, 'Tamsin').getByRole('button', { name: 'More choices' }).click();
    const composer = ann.page.getByRole('region', { name: 'Declare for Tamsin' });
    await expect(composer.getByRole('radio', { name: 'Attack' })).toBeChecked();
    await expect(composer.getByRole('button', { name: 'Throw: the goblins, 30 feet away' })).toBeVisible();
    await expect(composer).not.toContainText(/shoot/i);
    // She aims her magic missile at the second goblin instead.
    await composer
      .getByRole('radiogroup', { name: 'What Tamsin does this round' })
      .getByRole('radio', { name: 'Cast' })
      .click();
    await composer.getByRole('group', { name: 'Monsters' }).getByRole('button', { name: 'Goblin 2' }).click();
    await declaring(ann.page, () =>
      composer.getByRole('button', { name: 'Cast magic missile at Goblin 2' }).click(),
    );
    await expect(declarationRow(sam.page, 'Tamsin')).toContainText(/magic missile/i);
    await expect(declarationRow(sam.page, 'Tamsin')).toContainText('Goblin 2');
    await expect(battleBoard(sam.page)).not.toContainText(/tgt_/);
    await shot(ann.page, 'battle-declaring');

    // The board opens the next undeclared member's choices for Ann: Osric's.
    const osric = ann.page.getByRole('region', { name: 'Declare for Osric' });
    // Osric's attacks are out of reach, so his choices open on the Move tab, his suggested action (D-305).
    await expect(osric.getByRole('radio', { name: 'Move' })).toBeChecked();
    await declaring(ann.page, () => osric.getByRole('button', { name: 'Close in on the goblins' }).click());
    await declaring(sam.page, () =>
      declarationRow(sam.page, 'Wren')
        .getByRole('button', { name: /^Attack the goblins/ })
        .click(),
    );

    // The last declaration resolves the round by itself. Everyone sees the next round, and the feed tells it.
    for (const actor of [sam, ann, ruth]) {
      await expect(battleBoard(actor.page).getByRole('heading', { name: 'Round 2' })).toBeVisible({
        timeout: 30_000,
      });
    }
    // When the playback ends, the board sums the round up, and anyone can replay it.
    const board = battleBoard(sam.page);
    await expect(board.getByText('Round 1 result')).toBeVisible({ timeout: 30_000 });
    await board.getByRole('button', { name: 'Replay' }).click();
    const playing = board
      .getByRole('status')
      .filter({ has: sam.page.getByRole('button', { name: /^Skip/ }) });
    await expect(playing).toBeVisible();
    await shot(sam.page, 'battle-playback');
    await playing.getByRole('button', { name: /^Skip/ }).click();
    await expect(board.getByText('Round 1 result')).toBeVisible();
    const feed = await openFeed(sam.page);
    await expect(feed).toContainText(/magic missile/i);
    await expect(feed).toContainText(/Tamsin/);
  });

  test('a declaration that bxapi refuses is shown to the table, and changing it resolves the round', async ({
    crew,
  }) => {
    const table = await combatTable(crew, { autoResolve: false });
    const { sam, ann, tableId, memberId } = table;
    const game = await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // Sam's stale plan from another tab: Brenna attacks the goblins without closing the 30 feet to them.
    const goblins = game.view.encounter?.groups[0]?.id ?? '';
    await sam.client.declare(tableId, memberId('Brenna'), { action: 'attack', target_group_id: goblins });
    await declaring(sam.page, () =>
      declarationRow(sam.page, 'Wren')
        .getByRole('button', { name: /^Attack the goblins/ })
        .click(),
    );
    await declaring(ann.page, () =>
      declarationRow(ann.page, 'Osric').getByRole('button', { name: 'Close in on the goblins' }).click(),
    );
    await declaring(ann.page, () =>
      declarationRow(ann.page, 'Tamsin')
        .getByRole('button', { name: /^(Attack|Shoot|Throw)/ })
        .first()
        .click(),
    );
    await expect(battleBoard(sam.page)).toContainText('4 of 4 declared');

    await battleBoard(sam.page).getByRole('button', { name: 'Resolve the round' }).click();
    // Both players see which declaration failed and why, on Brenna's row.
    for (const actor of [sam, ann]) {
      await expect(declarationRow(actor.page, 'Brenna')).toContainText(/too far for a melee attack/);
      await expect(battleBoard(actor.page).getByRole('heading', { name: 'Round 1' })).toBeVisible();
    }
    await shot(ann.page, 'refused-declaration');

    // Sam changes Brenna's declaration to closing in, and the round resolves.
    await declarationRow(sam.page, 'Brenna').getByRole('button', { name: 'Change' }).click();
    const composer = sam.page.getByRole('region', { name: 'Declare for Brenna' });
    await composer.getByRole('radio', { name: 'Move' }).click();
    await declaring(sam.page, () =>
      composer.getByRole('button', { name: 'Close in on the goblins' }).click(),
    );
    await battleBoard(sam.page).getByRole('button', { name: 'Resolve the round' }).click();
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
    await declarationRow(ann.page, 'Tamsin').getByRole('button', { name: 'More choices' }).click();
    const composer = ann.page.getByRole('region', { name: 'Declare for Tamsin' });
    await composer.getByRole('radio', { name: 'Cast' }).click();
    const monsters = composer.getByRole('group', { name: 'Monsters' });
    await expect(monsters.getByRole('button', { name: 'Gashnak One-Ear', exact: true })).toBeVisible();
    await expect(monsters.getByRole('button', { name: /^Goblin \d$/ })).toHaveCount(2);
    await monsters.getByRole('button', { name: 'Gashnak One-Ear', exact: true }).click();
    await shot(ann.page, 'spell-at-gashnak');
    await declaring(ann.page, () =>
      composer.getByRole('button', { name: 'Cast magic missile at Gashnak One-Ear' }).click(),
    );
    await expect(declarationRow(sam.page, 'Tamsin')).toContainText(/magic missile at Gashnak One-Ear/i);

    // Everyone else holds, and the round resolves.
    const before = (await sam.client.getGame(tableId)).revision;
    for (const [actor, name] of [
      [sam, 'Brenna'],
      [sam, 'Wren'],
      [ann, 'Osric'],
    ] as const) {
      await actor.client.declare(tableId, table.memberId(name), { action: 'hold' });
    }
    await waitForGame(sam.client, tableId, (next) => next.revision > before, 'the round to resolve');
    const feed = await openFeed(sam.page);
    await expect(feed).toContainText(/Tamsin casts magic missile/i);
    await expect(feed.getByText(/magic missile/i).first()).toBeVisible();
    await expect(feed).toContainText(/Gashnak One-Ear/);
    await expect(feed).not.toContainText(/the Gashnak|Gashnak One-Ears|hobgoblin/i);
  });

  test('the refusal names the member whose declaration bxapi refused', async ({ crew }) => {
    const table = await combatTable(crew, { autoResolve: false });
    const { sam, tableId, memberId } = table;
    const game = await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    const goblins = game.view.encounter?.groups[0]?.id ?? '';
    await sam.client.declare(tableId, memberId('Brenna'), { action: 'attack', target_group_id: goblins });
    for (const name of ['Wren', 'Osric', 'Tamsin']) {
      const client = name === 'Wren' ? sam.client : table.ann.client;
      await client.declare(tableId, memberId(name), { action: 'hold' });
    }
    const result = await sam.client.resolveRound(tableId);
    expect(result.accepted).toBe(false);
    expect(result.declarations?.refusals.map((refusal) => refusal.member_id)).toEqual([memberId('Brenna')]);
    await openTable(sam.page, table.path);
    await expect(declarationRow(sam.page, 'Brenna')).toContainText(/too far for a melee attack/);
  });

  test('a party member dies, and the board and the party panel show it', async ({ crew }) => {
    const table = await combatTable(crew, { party: 'weak' });
    const { sam, ann, tableId } = table;
    await walkIntoGuardroom(sam.client, tableId);
    await send(sam.client, tableId, { command_type: 'engage_battle' });
    for (const actor of [sam, ann]) await openTable(actor.page, table.path);

    // With this seed, the goblins kill Tamsin in the second round.
    const game = await fightThroughSdk(table, (next) =>
      next.view.party.some((member) => member.current_hp <= 0),
    );
    expect(game.mode).toBe('battle');
    const tamsin = game.view.party.find((member) => member.name === 'Tamsin');
    expect(tamsin?.current_hp).toBeLessThanOrEqual(0);

    for (const actor of [sam, ann]) {
      // The board and the party panel use the same word for a dead member (D-306).
      await expect(declarationRow(actor.page, 'Tamsin')).toContainText('Dead', { timeout: 30_000 });
      await expect(declarationRow(actor.page, 'Tamsin')).not.toContainText('Down');
      await expect(declarationRow(actor.page, 'Tamsin').getByRole('button')).toHaveCount(0);
      await expect(
        actor.page.getByRole('list', { name: 'Marching order' }).getByRole('button', { name: /^Tamsin\b/ }),
      ).toHaveAccessibleDescription(/^0 of 1 hit points, .*dead/);
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
      await expect(party).toContainText('Brenna');
      await expect(party).toContainText('Tamsin');
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
        [sam, ['Brenna', 'Wren']],
        [ann, ['Osric', 'Tamsin']],
      ] as const) {
        for (const name of names) await declareSuggested(actor.page, name);
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
      await expect(summary.getByRole('definition').first()).toContainText('2 goblins slain');
      await expect(summary.getByRole('term').filter({ hasText: 'Experience' })).toBeVisible();
      // The summary counts experience in XP (D-307) and calls the coins dropped goods, as the scene does (D-308).
      await expect(summary).toContainText(/worth \d+ XP/);
      await expect(summary).toContainText('now among the dropped goods here');
      await expect(summary.getByRole('button', { name: 'Pick up the dropped goods' })).toBeVisible();
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
