/**
 * Performance sanity: how fast the play screen becomes usable, how large the built client is, and whether a long
 * session (thousands of feed entries, a level covered in drawings) stays responsive. Each test attaches its
 * measurements to the report and logs them, and fails only past generous budgets, so a slow shared machine
 * doesn't fail the suite but a regression of several times does.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Page, TestInfo } from '@playwright/test';
import { PROD, REPO_ROOT } from './support/env';
import { expect, test } from './support/fixtures';
import { stagedTable } from './support/states';

async function report(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value, null, 2);
  console.log(`[performance] ${name}: ${body}`);
  await testInfo.attach(`${name}.json`, { body, contentType: 'application/json' });
}

/** Starts counting long tasks (main-thread work over 50 ms) in the page. */
async function watchLongTasks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window as unknown as { __longTasks: number[] };
    store.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) store.__longTasks.push(Math.round(entry.duration));
    }).observe({ type: 'longtask', buffered: false });
  });
}

async function takeLongTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const store = window as unknown as { __longTasks: number[] };
    const tasks = store.__longTasks;
    store.__longTasks = [];
    return tasks;
  });
}

/** Measures frame intervals while `work` runs in the page for about a second. */
async function frameIntervals(
  page: Page,
  work: () => Promise<void>,
): Promise<{ frames: number; worstMs: number; medianMs: number }> {
  await page.evaluate(() => {
    const store = window as unknown as { __frames: number[]; __framing: boolean };
    store.__frames = [];
    store.__framing = true;
    let last = performance.now();
    const tick = (now: number) => {
      store.__frames.push(now - last);
      last = now;
      if (store.__framing) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await work();
  const frames = await page.evaluate(() => {
    const store = window as unknown as { __frames: number[]; __framing: boolean };
    store.__framing = false;
    return store.__frames.slice(1);
  });
  const sorted = [...frames].sort((a, b) => a - b);
  return {
    frames: frames.length,
    worstMs: Math.round(sorted.at(-1) ?? 0),
    medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
  };
}

test.describe('performance', () => {
  test('the play screen becomes usable quickly', async ({ crew }, testInfo) => {
    const staged = await stagedTable(crew, 'exploring');
    const { page } = staged.sam;
    // The first load is cold: an empty browser cache. The later loads are warm, as a returning player has them.
    const coldStarted = Date.now();
    await page.goto(staged.path);
    await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Where the party stands' })).toBeVisible();
    const coldMs = Date.now() - coldStarted;
    const coldTransferKb = await page.evaluate(() =>
      Math.round(
        performance
          .getEntriesByType('resource')
          .reduce((sum, resource) => sum + ((resource as PerformanceResourceTiming).transferSize ?? 0), 0) /
          1024,
      ),
    );

    const samples: number[] = [];
    let navigation: Record<string, number> = {};
    for (let run = 0; run < 3; run += 1) {
      const started = Date.now();
      await page.goto(staged.path);
      await expect(page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled({ timeout: 30_000 });
      await expect(page.getByRole('region', { name: 'Where the party stands' })).toBeVisible();
      samples.push(Date.now() - started);
      navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0] as
          PerformanceNavigationTiming | undefined;
        const paint = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          domContentLoadedMs: Math.round(entry?.domContentLoadedEventEnd ?? 0),
          loadMs: Math.round(entry?.loadEventEnd ?? 0),
          firstContentfulPaintMs: Math.round(paint?.startTime ?? 0),
          transferredKb: Math.round(
            performance
              .getEntriesByType('resource')
              .reduce(
                (sum, resource) => sum + ((resource as PerformanceResourceTiming).transferSize ?? 0),
                0,
              ) / 1024,
          ),
        };
      });
    }
    const median = [...samples].sort((a, b) => a - b)[1] ?? 0;
    await report(testInfo, 'play-screen-time-to-interactive', {
      build: PROD ? 'production' : 'development',
      coldMs,
      coldTransferKb,
      warmSamplesMs: samples,
      medianMs: median,
      lastNavigation: navigation,
    });
    expect(coldMs, 'time until the party can act on a cold load, in ms').toBeLessThan(PROD ? 8_000 : 30_000);
    expect(median, 'median time until the party can act on a warm load, in ms').toBeLessThan(
      PROD ? 5_000 : 15_000,
    );
  });

  test('the built client is reasonably small', async ({ browserName: _browser }, testInfo) => {
    test.skip(!PROD, 'Needs the production build. Run with E2E_PROD=1.');
    const dist = resolve(REPO_ROOT, process.env.E2E_WEB_DIST ?? 'apps/web/dist', 'assets');
    const assets = readdirSync(dist).map((file) => {
      const path = join(dist, file);
      const bytes = statSync(path).size;
      const compressible = /\.(js|css|html|svg|json)$/.test(file);
      return {
        file,
        kb: Math.round(bytes / 1024),
        gzipKb: compressible ? Math.round(gzipSync(readFileSync(path)).length / 1024) : null,
      };
    });
    assets.sort((a, b) => b.kb - a.kb);
    const scripts = assets.filter((asset) => asset.file.endsWith('.js'));
    const totalScriptGzipKb = scripts.reduce((sum, asset) => sum + (asset.gzipKb ?? 0), 0);
    await report(testInfo, 'built-assets', {
      largest: assets.slice(0, 8),
      scriptChunks: scripts.length,
      totalScriptGzipKb,
      totalKb: assets.reduce((sum, asset) => sum + asset.kb, 0),
    });
    // A budget well above today's size, so the test catches a large regression.
    expect(totalScriptGzipKb, 'gzipped JavaScript, in KB').toBeLessThan(900);
  });

  test('a first visit to the home page downloads only the home page', async ({ crew }, testInfo) => {
    test.skip(!PROD, 'Needs the production build. Run with E2E_PROD=1.');
    const visitor = await crew.person('Visitor', { signedIn: false });
    const { page } = visitor;
    const started = Date.now();
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible();
    const readyMs = Date.now() - started;
    const scripts = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('.js'))
        .map((entry) => ({
          file: entry.name.split('/').pop() ?? entry.name,
          transferKb: Math.round(((entry as PerformanceResourceTiming).transferSize ?? 0) / 1024),
          decodedKb: Math.round(((entry as PerformanceResourceTiming).decodedBodySize ?? 0) / 1024),
        })),
    );
    const transferKb = scripts.reduce((sum, script) => sum + script.transferKb, 0);
    const decodedKb = scripts.reduce((sum, script) => sum + script.decodedKb, 0);
    await report(testInfo, 'home-first-visit', {
      readyMs,
      scriptFiles: scripts.length,
      transferKb,
      decodedKb,
      scripts,
    });
    // The play screen's chunks shouldn't load before anyone needs them.
    expect(
      scripts
        .map((script) => script.file)
        .filter((file) => /^(PlayShell|MapStage|RefereePanel|compendium)-/.test(file)),
    ).toEqual([]);
  });

  test('a feed with thousands of entries stays responsive', async ({ crew }, testInfo) => {
    test.setTimeout(300_000);
    const staged = await stagedTable(crew, 'exploring');
    const { ruth, sam, tableId } = staged;
    const total = 2000;
    const started = Date.now();
    const posters = [ruth, sam];
    for (let batch = 0; batch < total; batch += 20) {
      await Promise.all(
        Array.from({ length: 20 }, (_, offset) => {
          const index = batch + offset;
          const poster = posters[index % 2] ?? ruth;
          return poster.client.postFeed(tableId, {
            text: `Message ${index + 1}: we should check the east passage before the torches burn down.`,
          });
        }),
      );
    }
    const postingMs = Date.now() - started;

    const { page } = sam;
    const opened = Date.now();
    await page.goto(staged.path);
    await page.getByRole('tab', { name: /^Feed/ }).click();
    const feed = page.getByRole('region', { name: 'Feed entries' });
    await expect(feed).toContainText(`Message ${total}:`, { timeout: 30_000 });
    const openMs = Date.now() - opened;

    await watchLongTasks(page);
    const scrolling = await frameIntervals(page, async () => {
      for (let step = 0; step < 20; step += 1) {
        await feed.evaluate((element) => {
          element.scrollTop = Math.max(0, element.scrollTop - 1500);
        });
        await page.waitForTimeout(50);
      }
    });
    const scrollLongTasks = await takeLongTasks(page);

    const composer = page.getByRole('textbox', { name: 'Message the table' });
    await composer.click();
    const typingStarted = Date.now();
    await composer.pressSequentially('The bell is louder here.', { delay: 0 });
    const typingMs = Date.now() - typingStarted;
    await page.keyboard.press('Enter');
    await expect(feed).toContainText('The bell is louder here.');
    const typingLongTasks = await takeLongTasks(page);

    await report(testInfo, 'long-feed', {
      entries: total,
      postingMs,
      openUntilNewestVisibleMs: openMs,
      scrolling,
      scrollLongTasksMs: scrollLongTasks,
      typing24CharactersMs: typingMs,
      typingLongTasksMs: typingLongTasks,
    });
    expect(openMs).toBeLessThan(15_000);
    expect(Math.max(0, ...scrollLongTasks), 'longest main-thread task while scrolling, in ms').toBeLessThan(
      500,
    );
    expect(typingMs, 'time to type 24 characters, in ms').toBeLessThan(3_000);
  });

  test('a level with many drawings and pins stays responsive', async ({ crew }, testInfo) => {
    test.setTimeout(300_000);
    const staged = await stagedTable(crew, 'exploring');
    const { ruth, sam, tableId } = staged;
    const strokes = 1500;
    const pins = 200;
    const level = { dungeon_id: 'priory', level_number: 1 };
    for (let batch = 0; batch < strokes; batch += 25) {
      await Promise.all(
        Array.from({ length: 25 }, (_, offset) => {
          const index = batch + offset;
          const x = (index * 7) % 28;
          const y = (index * 11) % 23;
          const points = Array.from({ length: 20 }, (_, point): [number, number] => [
            x + point * 0.1,
            y + Math.sin(point / 3),
          ]);
          return ruth.client.createAnnotation(tableId, { ...level, kind: 'stroke', points, width: 0.1 });
        }),
      );
    }
    for (let batch = 0; batch < pins; batch += 25) {
      await Promise.all(
        Array.from({ length: 25 }, (_, offset) => {
          const index = batch + offset;
          return ruth.client.createAnnotation(tableId, {
            ...level,
            kind: 'pin',
            x: (index * 3) % 28,
            y: (index * 5) % 23,
            text: `Note ${index + 1}`,
            visibility: 'everyone',
          });
        }),
      );
    }

    const { page } = sam;
    const opened = Date.now();
    await page.goto(staged.path);
    const map = page.getByRole('application', { name: /^Dungeon map/ });
    await expect(map).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
    const openMs = Date.now() - opened;

    await watchLongTasks(page);
    const box = await map.boundingBox();
    if (box === null) throw new Error('The map has no size.');
    await page.getByRole('button', { name: 'Pan the map' }).click();
    const panning = await frameIntervals(page, async () => {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let step = 0; step < 40; step += 1) {
        await page.mouse.move(
          box.x + box.width / 2 + Math.sin(step / 5) * 200,
          box.y + box.height / 2 + step * 3,
        );
      }
      await page.mouse.up();
    });
    const zooming = await frameIntervals(page, async () => {
      for (let step = 0; step < 10; step += 1) {
        await page.mouse.wheel(0, step % 2 === 0 ? -300 : 300);
        await page.waitForTimeout(50);
      }
    });
    const longTasks = await takeLongTasks(page);
    await report(testInfo, 'many-annotations', {
      strokes,
      pins,
      openUntilUsableMs: openMs,
      panning,
      zooming,
      longTasksMs: longTasks,
    });
    expect(openMs).toBeLessThan(15_000);
    expect(panning.medianMs, 'median frame while panning, in ms').toBeLessThan(100);
    expect(Math.max(0, ...longTasks), 'longest main-thread task, in ms').toBeLessThan(1_000);
  });
});
