/**
 * Drives the character wizard through the interface. Seed the ability rolls with `actor.seedAbilityRolls` first,
 * so each roll repeats.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The class card's accessible name is the class name. Its details are the card's description. */
export const CLASS_CARDS = {
  cleric: 'Cleric',
  dwarf: 'Dwarf',
  elf: 'Elf',
  fighter: 'Fighter',
  halfling: 'Halfling',
  magic_user: 'Magic-User',
  thief: 'Thief',
} as const;

/** A class the wizard offers. */
export type WizardClass = keyof typeof CLASS_CARDS;

/** Ability roll seeds that qualify for each class, from the server's seeded rolls. */
export const ROLL_SEEDS: Record<WizardClass, number> = {
  cleric: 4, // WIS 15
  dwarf: 56, // STR 14, CON 17
  elf: 99, // STR 16, INT 14
  fighter: 5, // STR 15, INT 14, so Intelligence can pay for Strength
  halfling: 80, // STR 16, DEX 16, CON 13
  magic_user: 9, // INT 16, so two extra languages
  thief: 14, // DEX 16
};

/** A seed whose roll doesn't qualify for a halfling (DEX 8), to make the player roll again. */
export const UNQUALIFIED_HALFLING_SEED = 1;

/** The wizard dialog. */
export function wizard(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Create a character' });
}

/** Opens the wizard from the lobby's "Your characters" section. */
export async function openWizard(page: Page): Promise<Locator> {
  await page
    .getByRole('region', { name: 'Your characters' })
    .getByRole('button', { name: 'Create a character' })
    .click();
  const dialog = wizard(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Clicks the footer's Continue button once it's enabled. */
export async function next(dialog: Locator): Promise<void> {
  const button = dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
}

/**
 * Rolls ability scores, and rolls again while the roll doesn't qualify for the class.
 *
 * @returns How many times the player rolled.
 */
export async function rollFor(dialog: Locator, classId: WizardClass, maxRolls = 5): Promise<number> {
  await dialog.getByRole('button', { name: 'Roll ability scores' }).click();
  const qualifies = dialog.getByRole('region', { name: 'Classes this roll qualifies for' });
  await expect(qualifies).toBeVisible();
  const label = classLabelText(classId);
  for (let rolls = 1; rolls <= maxRolls; rolls += 1) {
    const entry = qualifies.getByRole('listitem').filter({ hasText: new RegExp(`^${label}`) });
    const text = (await entry.textContent()) ?? '';
    if (!/needs/i.test(text)) return rolls;
    await dialog.getByRole('button', { name: 'Roll again' }).click();
    // A new roll replaces the old one, so wait for the list to say something else.
    await expect(entry).not.toHaveText(text);
  }
  throw new Error(`No roll in ${maxRolls} qualified for ${label}.`);
}

/** The class name as the wizard writes it. */
export function classLabelText(classId: WizardClass): string {
  const labels: Record<WizardClass, string> = {
    cleric: 'Cleric',
    dwarf: 'Dwarf',
    elf: 'Elf',
    fighter: 'Fighter',
    halfling: 'Halfling',
    magic_user: 'Magic-User',
    thief: 'Thief',
  };
  return labels[classId];
}

/** Picks a class on the class step and continues. */
export async function chooseClass(dialog: Locator, classId: WizardClass): Promise<void> {
  await dialog.getByRole('button', { name: CLASS_CARDS[classId], exact: true }).click();
  await next(dialog);
  await expect(dialog.getByRole('heading', { name: 'Adjust scores', level: 3 })).toBeVisible();
}

/** Names the character and picks an alignment on the identity step, without continuing. */
export async function fillIdentity(dialog: Locator, name: string, alignment = 'Lawful'): Promise<void> {
  await expect(dialog.getByRole('heading', { name: 'Identity', level: 3 })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
  await dialog.getByRole('radio', { name: alignment }).click();
}

/** Adds items to the cart on the outfit step. */
export async function addToCart(dialog: Locator, items: string[]): Promise<void> {
  for (const item of items) await dialog.getByRole('button', { name: `Add ${item} to the cart` }).click();
}

/** The cart panel on the outfit step. */
export function cart(dialog: Locator): Locator {
  return dialog.getByRole('complementary', { name: 'Cart' });
}

/**
 * Creates the character from the review step, waits for the "is ready" dialog that shows the new sheet, and
 * closes it with Done.
 */
export async function createFromReview(page: Page, dialog: Locator, name: string): Promise<void> {
  await expect(dialog.getByRole('heading', { name: 'Review', level: 3 })).toBeVisible();
  await dialog.getByRole('button', { name: 'Create character' }).click();
  const ready = page.getByRole('dialog', { name: `${name} is ready` });
  await expect(ready).toBeVisible({ timeout: 20_000 });
  await ready.getByRole('button', { name: 'Done' }).click();
  await expect(ready).toHaveCount(0);
}
