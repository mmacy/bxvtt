import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { REPO_ROOT } from './env';

/** The version in the root `package.json`, which the client shows on every screen. */
const VERSION = (JSON.parse(readFileSync(`${REPO_ROOT}/package.json`, 'utf8')) as { version: string })
  .version;

/**
 * Checks that a screen shows the link to the documentation and the version of the build, at the bottom left of
 * the window, or of the page when the page scrolls. The link opens the published documentation in a new tab and
 * has an accessible name.
 *
 * @param page - A page that shows any screen of the app.
 */
export async function expectSiteInfo(page: Page): Promise<void> {
  const link = page.getByRole('link', { name: /^Docs/ });
  await expect(link).toBeAttached();
  // A long page shows it at the foot of the page.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://mmacy.github.io/bxvtt/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAccessibleName(/\(opens in a new tab\)/);
  const version = page.getByText(`v${VERSION}`, { exact: true });
  await expect(version).toBeVisible();
  // The same place on every screen: the bottom left corner of the window.
  const size = page.viewportSize();
  const box = await link.boundingBox();
  const versionBox = await version.boundingBox();
  if (size === null || box === null || versionBox === null) throw new Error('The link has no box.');
  expect(box.x, 'link distance from the left edge').toBeLessThan(60);
  expect(
    size.height - (versionBox.y + versionBox.height),
    'version distance from the bottom edge',
  ).toBeLessThan(40);
}
