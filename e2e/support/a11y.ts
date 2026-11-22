/**
 * Accessibility and layout checks: axe for WCAG violations, a Tab walk for focus order and visibility, and an
 * overflow check for clipped content.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

/** One serious or critical axe violation, with the elements it affects. */
export interface Violation {
  id: string;
  impact: string;
  help: string;
  targets: string[];
}

/**
 * Runs axe on the page and returns its serious and critical violations of WCAG 2.1 A and AA. Attaches the full
 * list to the test report.
 *
 * @param page - The page to check.
 * @param testInfo - The test, for the attachment.
 * @param label - The screen's name in the attachment.
 * @param include - A CSS selector to check instead of the whole page, such as an open dialog.
 */
export async function seriousViolations(
  page: Page,
  testInfo: TestInfo,
  label: string,
  include?: string,
): Promise<Violation[]> {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include !== undefined) builder.include(include);
  const results = await builder.analyze();
  const violations = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? 'unknown',
      help: violation.help,
      targets: violation.nodes.slice(0, 6).map((node) => node.target.join(' ')),
    }));
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  return violations;
}

/** Formats violations for an assertion message. */
export function describeViolations(violations: Violation[]): string[] {
  return violations.map(
    (violation) => `${violation.impact} ${violation.id}: ${violation.help} (${violation.targets.join(', ')})`,
  );
}

/** One stop of a Tab walk. */
export interface FocusStop {
  /** A short description of the focused element: its role or tag and its accessible name. */
  label: string;
  /** Whether focusing the element changes how it, or the area just around it, looks. */
  indicated: boolean;
  /** Whether the element is visible and inside the viewport after the browser scrolled it into view. */
  visible: boolean;
}

/**
 * Presses Tab from the top of the page and records each focused element, until focus leaves the page or returns
 * to the first stop, or after `max` presses. To decide whether focus is visible, it compares a screenshot of the
 * element and a few pixels around it while focused with one taken after the element loses focus, so a ring drawn
 * on a wrapper or on a canvas counts.
 *
 * @returns The stops, and whether focus got stuck: the same short cycle repeated without reaching the end.
 */
export async function tabWalk(page: Page, max = 120): Promise<{ stops: FocusStop[]; trapped: boolean }> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const stops: FocusStop[] = [];
  const seen: string[] = [];
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  for (let press = 0; press < max; press += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    const handle = await page.evaluateHandle(() => document.activeElement);
    const element = handle.asElement();
    const info = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active === null || active === document.body) return null;
      const name =
        active.getAttribute('aria-label') ??
        active.getAttribute('title') ??
        (active.textContent ?? '').trim().slice(0, 60);
      const role = active.getAttribute('role') ?? active.tagName.toLowerCase();
      const rect = active.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
      const path: string[] = [];
      for (let node: Element | null = active; node !== null && path.length < 8; node = node.parentElement) {
        const index = node.parentElement ? Array.from(node.parentElement.children).indexOf(node) : 0;
        path.unshift(`${node.tagName}:${index}`);
      }
      return {
        label: `${role} "${name.slice(0, 80)}"`,
        visible,
        key: path.join('/'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
    if (info === null || element === null) return { stops, trapped: false };
    if (seen.length > 0 && info.key === seen[0]) return { stops, trapped: false };
    seen.push(info.key);

    let indicated = false;
    if (info.visible) {
      const x = Math.max(0, info.rect.x - 6);
      const y = Math.max(0, info.rect.y - 6);
      const clip = {
        x,
        y,
        width: Math.max(1, Math.min(viewport.width - x, info.rect.width + 12)),
        height: Math.max(1, Math.min(viewport.height - y, info.rect.height + 12)),
      };
      const focused = await page.screenshot({ clip, animations: 'disabled' });
      await element.evaluate((node) => (node as HTMLElement).blur());
      await page.waitForTimeout(150);
      const blurred = await page.screenshot({ clip, animations: 'disabled' });
      indicated = !focused.equals(blurred);
      await element.evaluate((node) => (node as HTMLElement).focus());
    }
    stops.push({ label: info.label, indicated, visible: info.visible });

    // A trap repeats a short cycle: the last 4 stops equal the 4 before them.
    if (seen.length >= 12) {
      const tail = seen.slice(-4).join('|');
      const before = seen.slice(-8, -4).join('|');
      if (tail === before && new Set(seen.slice(-4)).size < 4) return { stops, trapped: true };
    }
  }
  return { stops, trapped: true };
}

/** Elements with positive `tabindex`, which break the natural focus order. */
export async function positiveTabIndexes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[tabindex]'))
      .filter((element) => element.tabIndex > 0)
      .map(
        (element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`,
      ),
  );
}

/**
 * Finds content that overflows the viewport horizontally, and buttons, tabs, and headings whose text is cut off
 * without an ellipsis.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      problems.push(`the page scrolls sideways: ${root.scrollWidth}px of content in ${root.clientWidth}px`);
    }
    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}${element.getAttribute('role') ? `[role=${element.getAttribute('role')}]` : ''} "${(element.textContent ?? '').trim().slice(0, 50)}"`;
    for (const element of Array.from(
      document.querySelectorAll('button, [role="tab"], h1, h2, h3, label, [role="menuitem"]'),
    )) {
      const html = element as HTMLElement;
      const rect = html.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > window.innerWidth + 1) problems.push(`${describe(element)} runs past the right edge`);
      const style = getComputedStyle(html);
      const clips = style.overflow === 'hidden' || style.overflowX === 'hidden';
      if (clips && html.scrollWidth > html.clientWidth + 1 && style.textOverflow !== 'ellipsis') {
        problems.push(`${describe(element)} is cut off`);
      }
    }
    return [...new Set(problems)];
  });
}
