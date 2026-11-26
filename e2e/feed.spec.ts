/**
 * The feed and the journal: chat, whispers, dice rolls, a referee's secret roll, the game log, quests, and the
 * party's shared notes. Ruth is the referee, and Sam and Pip are players.
 */
import type { Page } from '@playwright/test';
import { SCREENS_DIR } from './support/env';
import { expect, expectNoRawText, readFeedLines, test, type Actor, type Crew } from './support/fixtures';
import { dungeonTable, lightTorch, openScene, partyActions, pickFromMenu, scenePanel } from './support/map';
import { enterDungeon, openTable, placeParty, send, setupTable } from './support/table';

/** Opens the feed tab. */
async function openFeed(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /^Feed/ }).click();
  await expect(page.getByRole('region', { name: 'Feed entries' })).toBeVisible();
}

/** Opens the journal tab at one of its sections. */
async function openJournal(page: Page, section: 'Quests' | 'Journal' | 'Notes'): Promise<void> {
  await page.getByRole('tab', { name: /^Journal/ }).click();
  const sections = page.getByRole('radiogroup', { name: 'Journal section' });
  await sections.getByRole('radio', { name: section }).click();
  await expect(sections.getByRole('radio', { name: section })).toBeChecked();
}

/** Types a message in the composer and sends it with Enter. */
async function post(page: Page, text: string): Promise<void> {
  const box = page.getByRole('textbox', { name: /^(Message the table|Whisper to)/ });
  await box.fill(text);
  await box.press('Enter');
  await expect(box).toHaveValue('');
}

/** The feed entries region. */
function feed(page: Page) {
  return page.getByRole('region', { name: 'Feed entries' });
}

/** A table in town with a referee and two players, each player with one character, and every page open. */
async function townTable(crew: Crew): Promise<{ ruth: Actor; sam: Actor; pip: Actor; tableId: string }> {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const pip = await crew.person('Pip');
  const { table, path } = await setupTable({
    name: 'Feed table',
    referee: ruth,
    players: [sam, pip],
    party: [
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: pip, name: 'Tinks', classId: 'thief' },
    ],
  });
  for (const person of [ruth, sam, pip]) {
    await openTable(person.page, path);
    await openFeed(person.page);
  }
  return { ruth, sam, pip, tableId: table.id };
}

test.describe('feed', () => {
  test('chat reaches everyone, and a whisper reaches only the people it names', async ({ crew }) => {
    const { ruth, sam, pip, tableId } = await townTable(crew);

    await post(sam.page, 'Has anyone got a spare torch?');
    for (const person of [ruth, sam, pip]) {
      await expect(feed(person.page).getByText('Has anyone got a spare torch?')).toBeVisible();
    }

    // A whisper typed with /w reaches the referee and nobody else.
    await post(sam.page, "/w Ruth I want to steal the reeve's purse");
    await expect(feed(ruth.page).getByText("I want to steal the reeve's purse")).toBeVisible();
    await expect(feed(sam.page).getByText("I want to steal the reeve's purse")).toBeVisible();

    // A whisper chosen from the menu: Pip whispers to Sam, and the referee doesn't read it.
    await pip.page.getByRole('button', { name: 'Whisper' }).click();
    await pip.page.getByRole('menuitemcheckbox', { name: 'Sam' }).click();
    await pip.page.keyboard.press('Escape');
    await expect(pip.page.getByRole('textbox', { name: 'Whisper to Sam' })).toBeVisible();
    await post(pip.page, 'Meet me behind the smokehouse');
    await expect(feed(sam.page).getByText('Meet me behind the smokehouse')).toBeVisible();

    // Wait for every message to arrive before checking who didn't get the whispers.
    await post(ruth.page, 'Everyone, the ferry leaves at dawn.');
    for (const person of [sam, pip]) {
      await expect(feed(person.page).getByText('Everyone, the ferry leaves at dawn.')).toBeVisible();
    }
    expect((await readFeedLines(pip.page)).join('\n')).not.toContain("steal the reeve's purse");
    expect((await readFeedLines(ruth.page)).join('\n')).not.toContain('behind the smokehouse');
    const pipsFeed = await pip.client.getFeed(tableId, { limit: 100 });
    expect(JSON.stringify(pipsFeed)).not.toContain("steal the reeve's purse");
    const ruthsFeed = await ruth.client.getFeed(tableId, { limit: 100 });
    expect(JSON.stringify(ruthsFeed)).not.toContain('behind the smokehouse');
    await sam.page.screenshot({ path: `${SCREENS_DIR}/feed-whispers-sam.png` });
  });

  test('a dice roll reaches everyone, and a secret roll only the referee', async ({ crew }) => {
    const { ruth, sam, pip, tableId } = await townTable(crew);

    await post(sam.page, '/roll 2d6+1 for damage');
    for (const person of [ruth, sam, pip]) {
      await expect(
        feed(person.page)
          .getByText(/2d6\s*\+\s*1/)
          .first(),
      ).toBeVisible();
      await expect(
        feed(person.page)
          .getByText(/for damage/)
          .first(),
      ).toBeVisible();
    }

    // The dice tray builds a roll without typing.
    await pip.page.getByRole('button', { name: 'Dice tray' }).click();
    const tray = pip.page.getByRole('region', { name: 'Dice tray' });
    await tray.getByRole('button', { name: 'Add a d20' }).click();
    await tray.getByRole('button', { name: /^Roll/ }).click();
    for (const person of [ruth, sam]) await expect(feed(person.page).getByText(/1d20/).first()).toBeVisible();

    // The referee rolls in secret. Only referees see it.
    await post(ruth.page, '/roll secret 1d20 for the ambush at the ford');
    await expect(feed(ruth.page).getByText('For the ambush at the ford', { exact: true })).toBeVisible();
    await post(ruth.page, 'Roll for initiative when I say so.');
    for (const person of [sam, pip]) {
      await expect(feed(person.page).getByText('Roll for initiative when I say so.')).toBeVisible();
      expect((await readFeedLines(person.page)).join('\n')).not.toContain('ambush at the ford');
    }
    expect(JSON.stringify(await sam.client.getFeed(tableId, { limit: 100 }))).not.toContain(
      'ambush at the ford',
    );

    // A player can't roll in secret: the composer offers no secret roll and the server refuses one.
    await sam.page.getByRole('textbox', { name: 'Message the table' }).fill('/');
    await expect(sam.page.getByRole('option', { name: /roll secret/ })).toHaveCount(0);
    await sam.page.getByRole('textbox', { name: 'Message the table' }).fill('');
  });

  test('the game log reads as sentences after a busy stretch of play', async ({ crew }) => {
    test.setTimeout(180_000);
    const setup = await dungeonTable(crew, { seed: 4 });
    const { sam, ruth, table } = setup;
    const place = (x: number, y: number, facing: 'north' | 'south' | 'east' | 'west') =>
      placeParty(ruth.client, table.id, { dungeon: 'priory', level: 1, x, y, facing });
    const scene = scenePanel(sam.page);

    // Light, a refused search, a found secret door, a sprung trap, treasure, referee gifts, rest, and chat.
    await lightTorch(sam.page);
    await openScene(sam.page);
    await place(15, 12, 'east');
    for (const member of ['Flarg', 'Tinks']) {
      if (await scene.getByText(/A door to the east/).isVisible()) break;
      await pickFromMenu(
        partyActions(sam.page).getByRole('button', { name: 'Search' }),
        'Search for secret doors',
        member,
      );
      await sam.page.waitForTimeout(800);
    }
    await place(26, 17, 'east');
    const take = scene.getByRole('button', { name: 'Take', exact: true });
    await take.click();
    await expect(take).toHaveCount(0);
    await place(18, 15, 'north');
    await pickFromMenu(scene.getByRole('button', { name: 'Door' }), 'Open door');
    await expect(scene.getByText('A door to the north is open.')).toBeVisible();
    await send(ruth.client, table.id, {
      command_type: 'grant_coins',
      character_id: 'character-0002',
      coins: { gp: 15 },
    });
    await send(ruth.client, table.id, {
      command_type: 'grant_item',
      character_id: 'character-0001',
      item_id: 'rope',
      quantity: 1,
    });
    await send(ruth.client, table.id, {
      command_type: 'award_xp',
      character_id: 'character-0001',
      amount: 25,
    });
    await pickFromMenu(partyActions(sam.page).getByRole('button', { name: 'Rest' }), 'Rest for one turn');
    await openFeed(sam.page);
    await post(sam.page, '/roll 1d6 to see if the rope holds');

    for (const person of [sam, ruth]) {
      await openFeed(person.page);
      const lines = await readFeedLines(person.page);
      expect(lines.length).toBeGreaterThan(15);
      expectNoRawText(lines, `${person.name}'s feed`);
      // The player reads the dungeon's name, as the referee does (D-210).
      expect(lines).toContain("The party is placed in the priory on Corvane's Holm, level 1.");
      // Each filter shows only its kind of entry and still reads as sentences.
      for (const filter of ['Game', 'Chat', 'Rolls', 'All']) {
        await person.page
          .getByRole('radiogroup', { name: 'Filter feed' })
          .getByRole('radio', { name: filter })
          .click();
        expectNoRawText(await readFeedLines(person.page), `${person.name}'s ${filter} filter`);
      }
    }
    await sam.page.screenshot({ path: `${SCREENS_DIR}/feed-busy-sam.png` });
    await ruth.page.screenshot({ path: `${SCREENS_DIR}/feed-busy-ruth.png` });
  });
});

test.describe('journal', () => {
  test('quests update when the party reveals an objective and the referee completes one', async ({
    crew,
  }) => {
    const setup = await dungeonTable(crew, { seed: 1981 });
    const { sam, ruth, table } = setup;
    await openScene(sam.page);
    await openJournal(sam.page, 'Quests');
    const hand = sam.page.getByRole('article', { name: 'The Hand of Saint Corvane' });
    await expect(
      hand.getByRole('list', { name: 'Objectives of The Hand of Saint Corvane' }).getByRole('listitem'),
    ).toHaveCount(2);
    await expect(hand).not.toContainText('Learn where the brothers hid the Hand');

    // Walking into the kobolds' warren reveals a hidden objective of the Hand's quest.
    await placeParty(ruth.client, table.id, { dungeon: 'priory', level: 1, x: 25, y: 7, facing: 'north' });
    await pickFromMenu(scenePanel(sam.page).getByRole('button', { name: 'Door' }), 'Open door');
    await expect(scenePanel(sam.page).getByText('A door to the north is open.')).toBeVisible();
    await send(sam.client, table.id, { command_type: 'move_party', direction: 'north' });
    await expect(hand).toContainText('Learn where the brothers hid the Hand');
    await expect(
      hand.getByRole('list', { name: 'Objectives of The Hand of Saint Corvane' }).getByRole('listitem'),
    ).toHaveCount(3);

    // The referee marks Gashnak's death, and the player's journal counts it.
    await send(ruth.client, table.id, {
      command_type: 'complete_objective',
      quest_id: 'red_thumbs',
      objective_id: 'kill_gashnak',
    });
    const thumbs = sam.page.getByRole('article', { name: 'Break the Red Thumbs' });
    await expect(thumbs).toContainText('1 of 2 objectives done');
    await expect(thumbs.getByRole('listitem').filter({ hasText: 'Kill Gashnak One-Ear' })).toContainText(
      /Done/,
    );

    // The journal section records the story beats.
    await openJournal(sam.page, 'Journal');
    const journal = sam.page.getByRole('tabpanel', { name: 'Journal' });
    await expect(journal.getByText(/kobolds jabber in broken Common/)).toBeVisible();
    await expect(journal.getByText(/Gashnak One-Ear will rob no more ferries/)).toBeVisible();
    await sam.page.screenshot({ path: `${SCREENS_DIR}/journal-after-quests.png` });
  });

  test('two people edit the shared notes, and a conflict lets the second writer choose', async ({ crew }) => {
    const { ruth, sam } = await townTable(crew);
    await openJournal(ruth.page, 'Notes');
    await openJournal(sam.page, 'Notes');
    const ruthsNotes = ruth.page.getByRole('textbox', { name: 'Party notes' });
    // While Sam compares the two versions, his box is labelled "Your version".
    const samsNotes = sam.page.getByRole('textbox', { name: /^(Party notes|Your version)$/ });

    // Ruth's notes save as she types and reach Sam.
    await ruthsNotes.fill('Reeve Tamsin Hale pays 100 gp for Gashnak.');
    await expect(ruth.page.getByText(/^Saved/)).toBeVisible();
    await expect(samsNotes).toHaveValue('Reeve Tamsin Hale pays 100 gp for Gashnak.');

    // Both write at once. Ruth saves first, so Sam's edit meets a conflict and Sam decides.
    await samsNotes.fill('Reeve Tamsin Hale pays 100 gp for Gashnak.\nBuy rope before we cross.');
    await ruthsNotes.fill('Reeve Tamsin Hale pays 100 gp for Gashnak.\nThe ferryman wants 5 gp each.');
    await ruthsNotes.press('Tab');
    const conflict = sam.page.getByText('Ruth saved the notes while you were writing');
    await expect(conflict).toBeVisible();
    await sam.page.getByRole('button', { name: 'See both' }).click();
    await expect(sam.page.getByRole('region', { name: "Ruth's version" })).toContainText(
      'The ferryman wants 5 gp each.',
    );
    await sam.page.screenshot({ path: `${SCREENS_DIR}/journal-notes-conflict.png` });

    // Sam folds Ruth's line into his version and keeps it. Ruth sees the merged notes.
    await samsNotes.fill(
      'Reeve Tamsin Hale pays 100 gp for Gashnak.\nThe ferryman wants 5 gp each.\nBuy rope before we cross.',
    );
    await sam.page.getByRole('button', { name: 'Keep mine' }).click();
    await expect(conflict).toHaveCount(0);
    await expect(ruthsNotes).toHaveValue(
      'Reeve Tamsin Hale pays 100 gp for Gashnak.\nThe ferryman wants 5 gp each.\nBuy rope before we cross.',
    );
  });
});

test('entering the dungeon writes the landing to the journal and the feed', async ({ crew }) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const { table, path } = await setupTable({
    referee: ruth,
    players: [sam],
    party: [{ owner: sam, name: 'Flarg', classId: 'fighter' }],
  });
  await openTable(sam.page, path);
  await enterDungeon(sam.client, table.id, 'priory');
  await openJournal(sam.page, 'Journal');
  await expect(
    sam.page
      .getByRole('tabpanel', { name: 'Journal' })
      .getByText(/a bell tolls once, somewhere beneath your feet/),
  ).toBeVisible();
  await openFeed(sam.page);
  await expect(feed(sam.page).getByText(/a bell tolls once/)).toBeVisible();
  // The autosave line reads as one sentence (D-208).
  await expect(feed(sam.page).getByText("Autosaved: entered the priory on Corvane's Holm.")).toBeVisible();
});
