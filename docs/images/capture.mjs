#!/usr/bin/env node
// Regenerates the screenshots in docs/images.
//
// Usage, from the repository root, with bxapi running and the client built (`npm run build`):
//
//   node docs/images/capture.mjs
//
// The script starts its own bxvtt server on a temporary data directory, sets up a table that plays The Drowned
// Bell with four named characters, drives a referee and three players in headless Chromium at 1440 by 900, and
// writes one WebP file for each screen. It stops the server and deletes the data directory when it finishes.
//
// Settings (environment variables):
//
// - BXAPI_URL: where bxapi listens. Default: http://127.0.0.1:8640
// - BXVTT_CAPTURE_PORT: the port of the temporary bxvtt server. Default: 8670
// - CAPTURE_ONLY: a comma-separated list of file names (without the extension) to keep. The script still plays
//   the whole game, but it writes only those files.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = dirname(fileURLToPath(import.meta.url));
const bxapiUrl = process.env.BXAPI_URL ?? 'http://127.0.0.1:8640';
const port = process.env.BXVTT_CAPTURE_PORT ?? '8670';
const base = `http://127.0.0.1:${port}`;
const only = process.env.CAPTURE_ONLY?.split(',').map((name) => name.trim());
const viewport = { width: 1440, height: 900 };

// A fixed session seed makes the dice repeat when the same commands run in the same order.
const SESSION_SEED = 1981;
const TABLE_NAME = 'Thursday at the Drowned Bell';

const dataDir = mkdtempSync(join(tmpdir(), 'bxvtt-capture-'));
let server = null;
let browser = null;

/** Calls the bxvtt HTTP API as one user. */
function client(token = null) {
  const call = async (method, path, body) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
    return text === '' ? null : JSON.parse(text);
  };
  return call;
}

async function startServer() {
  const health = await fetch(new URL('/health', bxapiUrl)).catch(() => null);
  if (health === null || !health.ok) {
    throw new Error(`bxapi does not answer at ${bxapiUrl}. Start it, or set BXAPI_URL.`);
  }
  if (
    !existsSync(join(root, 'apps', 'server', 'dist', 'main.js')) ||
    !existsSync(join(root, 'apps', 'web', 'dist'))
  ) {
    throw new Error('bxvtt is not built. Run `npm run build` first.');
  }
  const env = { ...process.env };
  delete env.BXVTT_HOST_KEY;
  server = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', join(root, 'apps', 'server', 'dist', 'main.js')],
    {
      cwd: root,
      stdio: 'ignore',
      env: {
        ...env,
        BXVTT_PORT: port,
        BXVTT_DATA_DIR: dataDir,
        BXAPI_URL: bxapiUrl,
        BXVTT_RELAX_LIMITS: 'true',
        BXVTT_ALLOW_CHARACTER_SEEDS: 'true',
        BXVTT_LOG_LEVEL: 'silent',
      },
    },
  );
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${base}/api/health`).catch(() => null);
    if (response?.ok) return;
    await sleep(200);
  }
  throw new Error(`The capture server did not start on port ${port}.`);
}

/** Creates a user and returns the user, the token, and an API caller. */
async function newPerson(name) {
  const { user, token } = await client()('POST', '/users', { name });
  return { name, user, token, call: client(token) };
}

/** Opens a browser context that is already signed in as a person. */
async function newPage(person, { seedRolls } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: base,
          localStorage: [
            { name: 'bxvtt.identity', value: JSON.stringify({ token: person.token, user: person.user }) },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  if (seedRolls !== undefined) {
    await page.route('**/api/ability-rolls', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      const body = JSON.parse(request.postData() ?? '{}');
      return route.continue({ postData: JSON.stringify({ ...body, seed: seedRolls }) });
    });
  }
  return page;
}

/** Converts a PNG to WebP in the browser, so the script needs no image library. */
async function toWebp(png) {
  const page = await browser.newPage();
  try {
    const encoded = await page.evaluate(async (data) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
      const bytes = new Uint8Array(await out.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    }, png.toString('base64'));
    return Buffer.from(encoded, 'base64');
  } finally {
    await page.close();
  }
}

/** Dismisses toasts, moves the pointer away, waits for animation, and writes one screenshot. */
async function snap(page, name, { settle = 700 } = {}) {
  for (const button of await page.getByRole('button', { name: 'Dismiss notification' }).all()) {
    await button.click().catch(() => {});
  }
  await page.mouse.move(2, 2);
  await sleep(settle);
  if (only !== undefined && !only.includes(name)) return;
  const png = await page.screenshot({ type: 'png' });
  const webp = await toWebp(png);
  writeFileSync(join(outDir, `${name}.webp`), webp);
  console.log(`${name}.webp  ${Math.round(webp.length / 1024)} KiB`);
}

async function tableText(page) {
  return page.locator('body').innerText();
}

/** The mode badge in the top bar: "In town", "Exploring", "Encounter", "Battle". */
async function modeOf(page) {
  const text = await tableText(page);
  return text.split('\n')[1] ?? '';
}

/** Presses the quick declaration button for every character who has not declared, on a player's page. */
async function declareAll(page) {
  for (let guard = 0; guard < 6; guard += 1) {
    const same = page.getByRole('button', { name: /^Declare same as last round/ }).first();
    if ((await same.count()) > 0) {
      await same.click().catch(() => {});
      await sleep(500);
      return;
    }
    const quick = page.getByRole('button', { name: /^(Attack|Close in on) the / }).first();
    if ((await quick.count()) === 0) return;
    await quick.click().catch(() => {});
    await sleep(500);
  }
}

async function main() {
  await startServer();
  browser = await chromium.launch();

  // The table and its people.
  const ruth = await newPerson('Ruth');
  const sam = await newPerson('Sam');
  const priya = await newPerson('Priya');
  const theo = await newPerson('Theo');
  const table = await ruth.call('POST', '/tables', { name: TABLE_NAME });
  const tableId = table.id;
  for (const player of [sam, priya, theo])
    await player.call('POST', '/join', { invite_code: table.invite_code });

  const create = async (person, spec) => {
    const character = await person.call('POST', '/characters', {
      name: spec.name,
      class_id: spec.classId,
      alignment: 'lawful',
      seed: spec.seed,
      purchases: spec.buy.map((item_id) => ({ item_id })),
      equip_item_ids: spec.equip,
    });
    await person.call('POST', `/tables/${tableId}/roster`, { character_id: character.id });
    return character;
  };
  await create(sam, {
    name: 'Brenna',
    classId: 'fighter',
    seed: 109,
    buy: ['chainmail', 'shield', 'sword', 'torch'],
    equip: ['chainmail', 'shield', 'sword'],
  });
  await create(sam, {
    name: 'Wren',
    classId: 'thief',
    seed: 19,
    buy: ['leather', 'sword', 'thieves_tools', 'torch'],
    equip: ['leather', 'sword'],
  });
  await create(priya, {
    name: 'Osric',
    classId: 'cleric',
    seed: 63,
    buy: ['chainmail', 'shield', 'mace', 'holy_symbol'],
    equip: ['chainmail', 'shield', 'mace'],
  });

  // Theo makes Tamsin in the wizard.
  const theoPage = await newPage(theo, { seedRolls: 9 });
  await theoPage.goto(`${base}/tables/${tableId}`);
  await theoPage
    .getByRole('region', { name: 'Your characters' })
    .getByRole('button', { name: 'Create a character' })
    .click();
  const wizard = theoPage.getByRole('dialog', { name: 'Create a character' });
  const next = async () => {
    await wizard
      .getByRole('contentinfo')
      .getByRole('button', { name: /Continue|Skip this step/ })
      .click();
    await sleep(900);
  };
  await wizard.getByRole('button', { name: 'Roll ability scores' }).click();
  await wizard.getByRole('region', { name: 'Classes this roll qualifies for' }).waitFor();
  await sleep(4500);
  await snap(theoPage, 'wizard-roll');
  await next();
  await wizard.getByRole('button', { name: /^Magic-User Human/ }).click();
  await next();
  await next();
  await wizard.getByRole('textbox', { name: 'Name' }).fill('Tamsin');
  await wizard.getByRole('radio', { name: 'Lawful' }).click();
  await wizard.getByRole('checkbox', { name: 'Elvish' }).click();
  await wizard.getByRole('checkbox', { name: 'Hobgoblin' }).click();
  await wizard.getByRole('button', { name: /^Sleep/ }).click();
  await next();
  await wizard.getByRole('button', { name: /^Add Dagger/ }).click();
  await wizard.getByRole('button', { name: /^Add Torches/ }).click();
  await wizard.getByRole('button', { name: /^Add Backpack/ }).click();
  await snap(theoPage, 'wizard-outfit');
  await next();
  await wizard.getByRole('button', { name: 'Create character' }).click();
  const ready = theoPage.getByRole('dialog', { name: 'Tamsin is ready' });
  await ready.waitFor({ timeout: 30_000 });
  await ready.getByRole('button', { name: 'Done' }).click();

  // The lobby, seen by the referee, with every player online.
  const samPage = await newPage(sam);
  const priyaPage = await newPage(priya);
  await samPage.goto(`${base}/tables/${tableId}`);
  await priyaPage.goto(`${base}/tables/${tableId}`);
  const ruthPage = await newPage(ruth);
  await ruthPage.goto(`${base}/tables/${tableId}`);
  await ruthPage.getByRole('button', { name: 'Start the game' }).waitFor();
  await sleep(1200);
  await snap(ruthPage, 'lobby');

  // Ruth starts the game from the lobby, with everyone online.
  await ruth.call('POST', `/tables/${tableId}/game`, {
    adventure_id: 'sample:the-drowned-bell',
    seed: SESSION_SEED,
  });
  await samPage.getByRole('tab', { name: 'Outfitter' }).waitFor();
  await sleep(1500);

  // Town: Sam shops for Wren.
  await samPage.getByRole('tab', { name: 'Outfitter' }).click();
  await samPage
    .getByRole('button', { name: /^Wren\b.*gp/ })
    .first()
    .click();
  await samPage.getByRole('button', { name: /^Add Tinder box/ }).click();
  await samPage.getByRole('button', { name: /^Add Rations \(standard/ }).click();
  await samPage.getByRole('button', { name: /^Add Rope/ }).click();
  await samPage.getByRole('button', { name: /^Add Oil/ }).click();
  await sleep(500);
  await snap(samPage, 'town');
  await samPage.getByRole('button', { name: /^Buy for Wren/ }).click();
  await sleep(1500);

  // Set out, light a torch, and walk into the guardroom.
  await samPage.getByRole('button', { name: 'Set out' }).first().click();
  await samPage.getByRole('dialog').getByRole('button', { name: 'Set out' }).click();
  await samPage
    .getByRole('button', { name: 'Blueprint map' })
    .click()
    .catch(() => {});
  await sleep(1500);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await samPage.getByRole('button', { name: 'Light', exact: true }).last().click();
    await samPage.getByRole('menuitem', { name: /Wren lights a torch/ }).click();
    await sleep(1000);
    if (!(await tableText(samPage)).includes('No light. The party is in the dark')) break;
  }
  await samPage.locator('h1').first().click();
  for (let step = 0; step < 4 && (await modeOf(samPage)) === 'Exploring'; step += 1) {
    await samPage.keyboard.press('ArrowUp');
    await sleep(1300);
  }

  // The fight. Priya and Theo declare first, so Sam's declaration resolves the round while Sam's page watches.
  await samPage
    .getByRole('button', { name: /^Fight/ })
    .last()
    .click();
  await samPage.getByRole('button', { name: 'Actions', exact: true }).first().waitFor();
  const theoPlay = theoPage;
  await theoPlay.goto(`${base}/tables/${tableId}`);
  await theoPlay.getByRole('button', { name: 'Actions', exact: true }).first().waitFor();
  await declareAll(priyaPage);
  await declareAll(theoPlay);
  await declareAll(samPage);
  await sleep(1600);
  await snap(samPage, 'battle', { settle: 0 });
  for (let round = 0; round < 8; round += 1) {
    await sleep(5000);
    if ((await modeOf(samPage)) !== 'Battle') break;
    for (const page of [priyaPage, theoPlay, samPage]) await declareAll(page);
  }
  await sleep(4000);
  await samPage
    .getByRole('button', { name: 'Close', exact: true })
    .click()
    .catch(() => {});
  await samPage
    .getByRole('button', { name: /Pick up the dropped goods/ })
    .first()
    .click()
    .catch(() => {});
  await sleep(1500);

  // Explore a little further: open the north door and walk through it.
  await samPage.locator('h1').first().click();
  await samPage.keyboard.press('ArrowUp');
  await sleep(1300);
  await samPage.keyboard.press('ArrowUp');
  await sleep(1300);
  await samPage
    .getByRole('button', { name: 'Door', exact: true })
    .click()
    .catch(() => {});
  await samPage
    .getByRole('menuitem', { name: /Open it/ })
    .click()
    .catch(() => {});
  await sleep(1200);
  await samPage.locator('h1').first().click();
  for (let step = 0; step < 3 && (await modeOf(samPage)) === 'Exploring'; step += 1) {
    await samPage.keyboard.press('ArrowUp');
    await sleep(1300);
  }
  for (let step = 0; step < 4 && (await modeOf(samPage)) === 'Exploring'; step += 1) {
    await samPage.keyboard.press('ArrowLeft');
    await sleep(1300);
  }

  // The table talks.
  const say = async (person, text) => {
    await person.call('POST', `/tables/${tableId}/feed`, { text });
    await sleep(250);
  };
  await say(sam, 'Torch is lit. Brenna goes first, shield up.');
  await say(priya, 'Osric stays behind Wren. I have the holy symbol ready if anything cold shows up.');
  await say(theo, 'Tamsin has sleep memorized and a dagger for anything that gets close.');
  await say(ruth, 'The corridor is wet underfoot. Somewhere below you, a bell tolls once.');
  await say(sam, '/roll 1d20 Wren listens at the door');
  await sleep(600);
  await samPage.getByRole('tab', { name: /Feed/ }).click();
  await sleep(1200);
  await samPage
    .getByRole('button', { name: 'Newest' })
    .click({ timeout: 2000 })
    .catch(() => {});
  await sleep(800);
  await snap(samPage, 'feed');

  // The map, with the party tab beside it.
  await samPage.getByRole('tab', { name: 'Party' }).click();
  await sleep(600);
  await snap(samPage, 'explore');

  // The character sheet.
  await samPage.getByRole('button', { name: /^Wren, level 1 thief/ }).click();
  await samPage.getByRole('dialog').last().waitFor();
  await sleep(900);
  await snap(samPage, 'sheet');
  await samPage.keyboard.press('Escape');
  await sleep(500);

  // The rules compendium.
  await samPage.locator('h1').first().click();
  await samPage.keyboard.press('b');
  const search = samPage
    .getByRole('searchbox')
    .or(samPage.getByPlaceholder(/Search spells/))
    .first();
  await search.fill('sleep');
  await sleep(600);
  await search.press('Enter');
  await sleep(1000);
  await snap(samPage, 'compendium');
  await samPage.keyboard.press('Escape');
  await samPage.keyboard.press('Escape');

  // The referee panel.
  await ruthPage.reload();
  await ruthPage.getByRole('tab', { name: 'Referee', exact: true }).click();
  await ruthPage.getByRole('tab', { name: 'Quick actions' }).click();
  await sleep(1200);
  await snap(ruthPage, 'referee');
}

try {
  await main();
} finally {
  await browser?.close();
  if (server !== null) server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}
