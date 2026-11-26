/**
 * A new magic-user's first day (R-502): the wizard puts the first spell in the spell book but memorizes nothing,
 * so the town warns by name, the caller rests the party for a night, the player prepares Sleep, and the caster
 * casts it in the first fight. A caster who skips the rest sees why the battle board offers no spell.
 */
import type { BxvttClient } from '@bxvtt/shared/client';
import type { Page } from '@playwright/test';
import { SCREENS_DIR } from './support/env';
import { expect, test, type Crew } from './support/fixtures';
import { battleBoard, declarationRow, declareSuggested, declaring } from './support/combat';
import { ADVENTURES, enterDungeon, openTable, send, setupTable } from './support/table';

/** Ruth referees, and Sam plays Flarg (a fighter) and Mazpar (a magic-user who knows Sleep). */
async function setup(crew: Crew) {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const table = await setupTable({
    name: 'First spell',
    referee: ruth,
    players: [sam],
    adventure: ADVENTURES.toll,
    party: [
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: sam, name: 'Mazpar', classId: 'magic_user' },
    ],
  });
  return { ruth, sam, ...table, tableId: table.table.id };
}

/** Starts a battle against goblins, who attack at once, after the party has entered the bridge. */
async function startFight(ruthClient: BxvttClient, tableId: string, samClient: BxvttClient) {
  await enterDungeon(samClient, tableId, 'bridge');
  let game = await send(ruthClient, tableId, {
    command_type: 'spawn_monsters',
    template_id: 'goblin',
    count_fixed: 2,
    distance_feet: 40,
  });
  if (game.mode === 'encounter') game = await send(samClient, tableId, { command_type: 'engage_battle' });
  expect(game.mode).toBe('battle');
}

async function openMazparsChoices(page: Page) {
  const close = page.getByRole('button', { name: /^Close .*'s actions$/ });
  if ((await close.count()) > 0) await close.first().click();
  await declarationRow(page, 'Mazpar').getByRole('button', { name: 'Actions' }).click();
  return page.getByRole('region', { name: 'Declare for Mazpar' });
}

test.describe('a new caster', () => {
  test('without a night of rest, the battle board says why Mazpar has no spell to cast', async ({ crew }) => {
    const { ruth, sam, path, tableId } = await setup(crew);
    await startFight(ruth.client, tableId, sam.client);
    await openTable(sam.page, path);
    await expect(battleBoard(sam.page)).toBeVisible({ timeout: 20_000 });

    const composer = await openMazparsChoices(sam.page);
    const cast = composer
      .getByRole('radiogroup', { name: 'What Mazpar does this round' })
      .getByRole('radio', {
        name: 'Cast',
      });
    await expect(cast).toBeDisabled();
    await expect(composer).toContainText('Mazpar has no spells memorized');
    await expect(composer.getByRole('button', { name: "Open Mazpar's spells" })).toBeVisible();
    await sam.page.screenshot({ path: `${SCREENS_DIR}/caster-no-spells-in-battle.png` });
  });

  test('the town warns, the party rests, Mazpar prepares Sleep, and she casts it in the first fight', async ({
    crew,
  }) => {
    const { ruth, sam, path, tableId } = await setup(crew);
    await openTable(sam.page, path);
    const page = sam.page;

    // The town square warns by name before the party leaves.
    const warning = page.getByText("Mazpar needs a night's rest before preparing spells.").first();
    await expect(warning).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${SCREENS_DIR}/caster-town-warning.png` });
    await page.getByRole('button', { name: 'Rest for a night' }).first().click();
    const confirm = page.getByRole('alertdialog');
    if (await confirm.isVisible().catch(() => false))
      await confirm.getByRole('button', { name: /rest/i }).click();

    // After the rest, the town points at her spells.
    await expect(page.getByText('Mazpar can prepare spells now.').first()).toBeVisible();
    await page.getByRole('button', { name: "Open Mazpar's spells" }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Mazpar' });
    await expect(sheet.getByRole('tab', { name: 'Spells' })).toHaveAttribute('aria-selected', 'true');
    await sheet.getByRole('button', { name: 'Prepare spells' }).click();
    const prepare = page.getByRole('dialog', { name: "Prepare Mazpar's spells" });
    // The dialog lists the spells she can prepare under a heading for their level, with that level's count.
    const firstLevel = prepare.getByRole('region', { name: '1st-level spells' });
    await expect(firstLevel.getByRole('heading', { name: '1st-level spells' })).toBeVisible();
    await expect(prepare.getByRole('region', { name: /-level spells$/ })).toHaveCount(1);
    await expect(firstLevel.getByText('Sleep', { exact: true })).toBeVisible();
    if (await firstLevel.getByText('0 of 1 slots chosen').isVisible()) {
      await firstLevel.getByRole('button', { name: 'More copies of Sleep' }).click();
    }
    await expect(firstLevel.getByText('1 of 1 slots chosen')).toBeVisible();
    await prepare.getByRole('button', { name: 'Prepare spells' }).click();
    await expect(prepare).toHaveCount(0);
    await expect(sheet.getByRole('region', { name: 'Memorized spells' })).toContainText('Sleep');
    await sheet.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByText('Mazpar has no spells memorized').first()).toHaveCount(0);

    // The first fight: Mazpar casts Sleep at the goblins.
    await startFight(ruth.client, tableId, sam.client);
    await expect(battleBoard(page)).toBeVisible({ timeout: 20_000 });
    const composer = await openMazparsChoices(page);
    await composer
      .getByRole('radiogroup', { name: 'What Mazpar does this round' })
      .getByRole('radio', { name: 'Cast' })
      .click();
    // Sleep by Hit Dice takes the goblins as a group, so it needs no single target.
    await composer.getByRole('radio', { name: 'By hit dice' }).click();
    const declare = composer.getByRole('button', { name: /^Cast sleep/i }).first();
    await expect(declare).toBeEnabled();
    await expect(declare).toBeVisible();
    await page.screenshot({ path: `${SCREENS_DIR}/caster-casting-sleep.png` });
    await declaring(page, () => declare.click());
    await expect(declarationRow(page, 'Mazpar')).toContainText(/sleep/i);
    // Flarg takes her suggested action, so every member has declared and the round resolves.
    expect(await declareSuggested(page, 'Flarg')).toBe(true);

    await page.getByRole('tab', { name: /^Feed/ }).click();
    await expect(page.getByRole('region', { name: 'Feed entries' })).toContainText(/Mazpar casts sleep/i, {
      timeout: 20_000,
    });
  });
});
