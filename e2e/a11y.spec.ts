/**
 * Accessibility and layout: axe on every main screen and state, a keyboard walk through each main screen, three
 * viewport sizes, and reduced motion. Each test saves a screenshot under `.data/screens/e2e/a11y-*.png`.
 */
import type { Page } from '@playwright/test';
import {
  describeViolations,
  layoutProblems,
  positiveTabIndexes,
  seriousViolations,
  tabWalk,
} from './support/a11y';
import { SCREENS_DIR } from './support/env';
import { expect, test } from './support/fixtures';
import { stagedTable, type Stage } from './support/states';
import { openTable } from './support/table';

async function shoot(page: Page, label: string): Promise<void> {
  await page.screenshot({ path: `${SCREENS_DIR}/a11y-${label}.png` });
}

/** Waits for the play screen of a stage to settle. */
async function settle(page: Page, stage: Stage): Promise<void> {
  if (stage === 'town') await expect(page.getByRole('tablist', { name: 'Parts of town' })).toBeVisible();
  if (stage === 'exploring' || stage === 'encounter' || stage === 'battle') {
    await expect(page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();
  }
  if (stage === 'lobby') await expect(page.getByRole('heading', { name: 'Party', level: 2 })).toBeVisible();
  // Let entrance transitions and the first feed page finish.
  await page.waitForTimeout(800);
}

test.describe('axe finds no serious or critical violations', () => {
  test('home, first run', async ({ crew }, testInfo) => {
    const visitor = await crew.person('Visitor', { signedIn: false });
    await visitor.page.goto('/');
    await expect(visitor.page.getByRole('form', { name: 'Pick your name' })).toBeVisible();
    await shoot(visitor.page, 'home-first-run');
    expect(describeViolations(await seriousViolations(visitor.page, testInfo, 'home-first-run'))).toEqual([]);
  });

  test('home with tables', async ({ crew }, testInfo) => {
    const ruth = await crew.person('Ruth');
    await ruth.client.createTable({ name: 'Thursday' });
    await ruth.page.goto('/');
    await expect(ruth.page.getByRole('link', { name: /Thursday/ })).toBeVisible();
    await shoot(ruth.page, 'home');
    expect(describeViolations(await seriousViolations(ruth.page, testInfo, 'home'))).toEqual([]);
  });

  test('join page', async ({ crew }, testInfo) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Thursday' });
    await sam.client.joinTable(table.invite_code);
    const visitor = await crew.person('Visitor', { signedIn: false });
    await visitor.page.goto(`/join/${table.invite_code}`);
    // Sam is offline, so the page offers both the new player's form and the returning player's choices. Ruth is
    // the only referee, and nobody else could let her back in, so she isn't offered.
    await expect(visitor.page.getByRole('heading', { name: "I'm new here" })).toBeVisible();
    await expect(
      visitor.page.getByRole('heading', { name: "I've played at this table before" }),
    ).toBeVisible();
    await expect(visitor.page.getByRole('button', { name: 'Come back in as Sam' })).toBeVisible();
    await expect(visitor.page.getByRole('button', { name: 'Come back in as Ruth' })).toHaveCount(0);
    await shoot(visitor.page, 'join');
    expect(describeViolations(await seriousViolations(visitor.page, testInfo, 'join'))).toEqual([]);
  });

  test('lobby, referee and player', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'lobby');
    const found: string[] = [];
    for (const [who, actor] of [
      ['referee', staged.ruth],
      ['player', staged.sam],
    ] as const) {
      await openTable(actor.page, staged.path);
      await settle(actor.page, 'lobby');
      await shoot(actor.page, `lobby-${who}`);
      found.push(...describeViolations(await seriousViolations(actor.page, testInfo, `lobby-${who}`)));
    }
    expect(found).toEqual([]);
  });

  test('character wizard', async ({ crew }, testInfo) => {
    const ruth = await crew.person('Ruth');
    const table = await ruth.client.createTable({ name: 'Wizard' });
    await openTable(ruth.page, `/tables/${table.id}`);
    await ruth.page.getByRole('button', { name: 'Create a character' }).click();
    const dialog = ruth.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await ruth.page.waitForTimeout(800);
    await shoot(ruth.page, 'wizard');
    expect(
      describeViolations(await seriousViolations(ruth.page, testInfo, 'wizard', '[role="dialog"]')),
    ).toEqual([]);
  });

  test('town, every part of town', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'town');
    const { page } = staged.sam;
    await openTable(page, staged.path);
    await settle(page, 'town');
    const found: string[] = [];
    const tabs = page.getByRole('tablist', { name: 'Parts of town' }).getByRole('tab');
    const count = await tabs.count();
    for (let index = 0; index < count; index += 1) {
      const tab = tabs.nth(index);
      const name = ((await tab.textContent()) ?? `tab ${index}`).trim();
      await tab.click();
      await page.waitForTimeout(400);
      const label = `town-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`;
      await shoot(page, label);
      found.push(
        ...describeViolations(await seriousViolations(page, testInfo, label)).map((v) => `${name}: ${v}`),
      );
    }
    expect(found).toEqual([]);
  });

  test('exploring, player and referee', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'exploring');
    const found: string[] = [];
    for (const [who, actor] of [
      ['player', staged.sam],
      ['referee', staged.ruth],
    ] as const) {
      await openTable(actor.page, staged.path);
      await settle(actor.page, 'exploring');
      await shoot(actor.page, `exploring-${who}`);
      found.push(...describeViolations(await seriousViolations(actor.page, testInfo, `exploring-${who}`)));
    }
    await staged.ruth.page.getByRole('tab', { name: 'Referee' }).click();
    await staged.ruth.page.waitForTimeout(800);
    await shoot(staged.ruth.page, 'referee-panel');
    found.push(...describeViolations(await seriousViolations(staged.ruth.page, testInfo, 'referee-panel')));
    expect(found).toEqual([]);
  });

  test('dock tabs, character sheet, rules reference, and dialogs', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'exploring');
    const { page } = staged.ruth;
    await openTable(page, staged.path);
    await settle(page, 'exploring');
    const found: string[] = [];
    const check = async (label: string) => {
      await page.waitForTimeout(600);
      await shoot(page, label);
      found.push(
        ...describeViolations(await seriousViolations(page, testInfo, label)).map((v) => `${label}: ${v}`),
      );
    };

    await page.getByRole('tab', { name: /^Feed/ }).click();
    await check('feed');
    await page.getByRole('tab', { name: 'Journal' }).click();
    await check('journal');

    await page.getByRole('tab', { name: 'Party' }).click();
    await page
      .getByRole('list', { name: 'Marching order' })
      .getByRole('button', { name: /^Brenna/ })
      .click();
    await check('character-sheet');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Rules reference' }).click();
    await check('rules-reference');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Table menu' }).click();
    await page.getByRole('menuitem', { name: 'Saves', exact: true }).click();
    await check('saves');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Table menu' }).click();
    await page
      .getByRole('menuitem', { name: /settings/i })
      .first()
      .click();
    await check('settings');
    await page.keyboard.press('Escape');

    expect(found).toEqual([]);
  });

  for (const stage of ['encounter', 'battle', 'game_over'] as const) {
    test(`${stage.replace('_', ' ')}`, async ({ crew }, testInfo) => {
      const staged = await stagedTable(crew, stage);
      const { page } = staged.sam;
      await openTable(page, staged.path);
      await settle(page, stage);
      if (stage === 'game_over') {
        await expect(page.getByRole('heading', { name: 'The party has fallen' })).toBeVisible({
          timeout: 25_000,
        });
        await page.waitForTimeout(800);
      }
      await shoot(page, stage);
      expect(describeViolations(await seriousViolations(page, testInfo, stage))).toEqual([]);
    });
  }
});

test.describe('axe on the screens added in the fix round', () => {
  test('rejoining: the visitor waits, and the referee sees the request', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'town');
    await openTable(staged.ruth.page, staged.path);
    const visitor = await crew.person('Visitor', { signedIn: false });
    await visitor.page.goto(`/join/${staged.table.invite_code}`);
    await visitor.page.getByRole('button', { name: 'Come back in as Sam' }).click();
    await expect(
      visitor.page.getByRole('heading', { name: /Waiting for a referee to let you in as Sam/ }),
    ).toBeVisible();
    await shoot(visitor.page, 'rejoin-waiting');
    const found = describeViolations(await seriousViolations(visitor.page, testInfo, 'rejoin-waiting'));

    const requests = staged.ruth.page.getByRole('region', { name: 'Requests to come back in' });
    await expect(requests).toBeVisible();
    await shoot(staged.ruth.page, 'rejoin-request');
    found.push(...describeViolations(await seriousViolations(staged.ruth.page, testInfo, 'rejoin-request')));
    await requests.getByRole('button', { name: 'Not now' }).click();
    await expect(requests).toBeHidden();
    expect(found).toEqual([]);
  });

  test('the lobby offers to continue from a save', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'town');
    await staged.ruth.client.createSave(staged.tableId, 'Before the ferry');
    await staged.ruth.client.endGame(staged.tableId);
    const { page } = staged.ruth;
    await openTable(page, staged.path);
    await settle(page, 'lobby');
    await page.getByRole('button', { name: 'Continue from a save' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(600);
    await shoot(page, 'lobby-continue');
    expect(describeViolations(await seriousViolations(page, testInfo, 'lobby-continue'))).toEqual([]);
  });
});

test.describe('user colors', () => {
  test('every user color reads as a name in the feed', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'exploring');
    const { ruth } = staged;
    const { USER_COLORS } = await import('@bxvtt/shared/protocol');
    await openTable(ruth.page, staged.path);
    await ruth.page.getByRole('tab', { name: /^Feed/ }).click();
    const failing: string[] = [];
    for (const color of USER_COLORS) {
      await ruth.client.updateMe({ color });
      await ruth.client.postFeed(staged.tableId, { text: `Written in ${color}.` });
      await expect(ruth.page.getByRole('region', { name: 'Feed entries' })).toContainText(
        `Written in ${color}.`,
      );
      const violations = await seriousViolations(
        ruth.page,
        testInfo,
        `color-${color.slice(1)}`,
        '[aria-label="Feed entries"]',
      );
      if (violations.some((violation) => violation.id === 'color-contrast')) failing.push(color);
    }
    expect(failing, 'user colors whose names fail contrast in the feed').toEqual([]);
  });
});

test.describe('keyboard', () => {
  for (const stage of ['lobby', 'town', 'exploring', 'battle'] as const) {
    test(`tabbing through the ${stage} screen shows each focus and never traps it`, async ({ crew }) => {
      const staged = await stagedTable(crew, stage);
      const { page } = staged.sam;
      await openTable(page, staged.path);
      await settle(page, stage);
      expect(await positiveTabIndexes(page), 'elements with a positive tabindex').toEqual([]);
      const { stops, trapped } = await tabWalk(page);
      expect(
        trapped,
        `focus got stuck after: ${stops
          .slice(-6)
          .map((s) => s.label)
          .join(' > ')}`,
      ).toBe(false);
      expect(stops.length).toBeGreaterThan(5);
      expect(
        stops.filter((stop) => !stop.indicated).map((stop) => stop.label),
        'focused elements without a visible focus indicator',
      ).toEqual([]);
      expect(
        stops.filter((stop) => !stop.visible).map((stop) => stop.label),
        'focused elements outside the viewport',
      ).toEqual([]);
    });
  }

  test('the home page and the join page work from the keyboard alone', async ({ crew }) => {
    const visitor = await crew.person('Visitor', { signedIn: false });
    const { page } = visitor;
    await page.goto('/');
    const name = page.getByRole('textbox', { name: 'Your name' });
    await expect(name).toBeVisible();
    const order: string[] = [];
    for (
      let press = 0;
      press < 6 && !(await name.evaluate((element) => element === document.activeElement));
      press += 1
    ) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? ''));
    }
    await expect(name, `focus went to: ${order.join(' | ')}`).toBeFocused();
    await page.keyboard.type('Keyboard Kate');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Your tables', level: 1 })).toBeVisible();
    await page.getByRole('textbox', { name: 'Table name' }).focus();
    await page.keyboard.type('Keys only');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/tables\/tbl_/);
  });
});

test.describe('layout', () => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 820, height: 1180 },
  ];

  for (const stage of ['lobby', 'town', 'exploring', 'battle'] as const) {
    test(`the ${stage} screen fits 1440x900, 1024x768, and 820x1180`, async ({ crew }) => {
      const staged = await stagedTable(crew, stage);
      const { page } = staged.sam;
      await openTable(page, staged.path);
      await settle(page, stage);
      const found: string[] = [];
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(600);
        await shoot(page, `layout-${stage}-${viewport.width}x${viewport.height}`);
        for (const problem of await layoutProblems(page))
          found.push(`${viewport.width}x${viewport.height}: ${problem}`);
      }
      expect(found).toEqual([]);
    });
  }

  test('below 1100 px the dock moves into a drawer that opens and closes', async ({ crew }) => {
    const staged = await stagedTable(crew, 'exploring', { viewport: { width: 1024, height: 768 } });
    const { page } = staged.sam;
    await openTable(page, staged.path);
    await settle(page, 'exploring');
    await expect(page.getByRole('complementary', { name: 'Table panels' })).toBeHidden();
    await page
      .getByRole('button', { name: /table panels/i })
      .first()
      .click();
    await expect(page.getByRole('tab', { name: 'Party' })).toBeVisible();
    await shoot(page, 'layout-drawer-open');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tab', { name: 'Party' })).toBeHidden();
  });
});

test.describe('reduced motion', () => {
  test('with prefers-reduced-motion, nothing animates for long', async ({ crew }) => {
    const staged = await stagedTable(crew, 'exploring', { reducedMotion: 'reduce' });
    const { page } = staged.sam;
    await openTable(page, staged.path);
    await settle(page, 'exploring');
    await page.getByRole('tab', { name: /^Feed/ }).click();
    await page.getByRole('textbox', { name: 'Message the table' }).fill('/roll 3d6');
    await page.keyboard.press('Enter');
    await page.getByRole('application', { name: /^Dungeon map/ }).focus();
    await page.keyboard.press('ArrowUp');
    // Sample the running animations while the roll and the move would animate.
    const long: string[] = [];
    for (let sample = 0; sample < 10; sample += 1) {
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running')
          .map((animation) => {
            const timing = animation.effect?.getComputedTiming();
            const duration = typeof timing?.duration === 'number' ? timing.duration : 0;
            const target = (animation.effect as KeyframeEffect | null)?.target;
            const targetClass = target?.getAttribute('class') ?? '';
            const name =
              animation instanceof CSSAnimation
                ? animation.animationName
                : animation instanceof CSSTransition
                  ? animation.transitionProperty
                  : 'script';
            const iterations = timing?.iterations ?? 1;
            return { name, duration, iterations, target: targetClass.slice(0, 60) };
          })
          // A loading spinner is essential motion, so reduced motion may keep it turning.
          .filter((animation) => !/spin/i.test(animation.name))
          .filter((animation) => animation.duration > 200 || animation.iterations === Infinity)
          .map(
            (animation) =>
              `${animation.name} ${animation.duration}ms x${animation.iterations} on ${animation.target}`,
          ),
      );
      long.push(...running);
      await page.waitForTimeout(100);
    }
    expect([...new Set(long)], 'animations longer than 200 ms under reduced motion').toEqual([]);
  });
});
