#!/usr/bin/env node
// Regenerates the screenshots in docs/images.
//
// Usage, from the repository root, with bxapi running and the client built (`npm run build`):
//
//   node docs/images/capture.mjs
//
// The script starts its own bxvtt server on a temporary data directory, sets up a table that plays The Drowned
// Bell with four named characters, drives a referee and three players in headless Chromium at 1440 by 900, and
// writes one WebP file for each screen. When it finishes, it stops the server, deletes what the server stored in
// bxapi, and deletes the data directory.
//
// The browsers send only the commands that a screenshot shows, such as the town purchase. Every other game command,
// declaration, and fight goes through the HTTP API in a fixed order, so the session's dice come out the same on
// every run and each screenshot shows the same moment. The script fails when a page isn't in the mode its
// screenshot needs, so a stray fight can't end up in a screenshot of exploring. If you change a command before a
// screenshot, check every image after it.
//
// Settings (environment variables):
//
// - BXAPI_URL: where bxapi listens. Default: http://127.0.0.1:8651
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
import { purgeBxapi } from '../../scripts/purge-bxapi.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = dirname(fileURLToPath(import.meta.url));
const bxapiUrl = process.env.BXAPI_URL ?? 'http://127.0.0.1:8651';
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
  console.log(`The capture server is process ${server.pid} on port ${port}.`);
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
    await page.route('**/api/tables/*/ability-rolls', async (route) => {
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

/** Calls the bxvtt API as one person at the capture's table. */
function at(person, tableId) {
  const game = () => person.call('GET', `/tables/${tableId}/game`);
  return {
    game,
    /** Sends one game command and returns the result. Throws when bxapi refuses it, unless `refusable`. */
    async send(command, { refusable = false } = {}) {
      const { revision } = await game();
      const result = await person.call('POST', `/tables/${tableId}/game/commands`, {
        command,
        expected_revision: revision,
      });
      if (!result.accepted && !refusable) {
        throw new Error(`bxapi refused ${command.command_type}: ${JSON.stringify(result.rejections)}`);
      }
      return result;
    },
    declare: (memberId, declaration) =>
      person.call('PUT', `/tables/${tableId}/game/declarations/${memberId}`, { declaration }),
  };
}

/** Waits until a condition on the game holds, polling as one person. */
async function waitForGame(api, test, what, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    const game = await api.game();
    if (test(game)) return game;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${what}.`);
    await sleep(250);
  }
}

/** The party member ID of a character, by name. */
function memberId(game, name) {
  const seat = game.seats.find((candidate) => candidate.name === name);
  if (seat === undefined) throw new Error(`Nobody named ${name} is in the party.`);
  return seat.member_id;
}

/** The first monster group still standing in the battle. */
function firstGroup(game) {
  return game.view.encounter?.groups.find((group) => !group.fled && group.count > 0);
}

/**
 * Plays battle rounds through the API until the battle ends: each declarer closes in on the first group still
 * standing, or attacks it once within 5 feet. Each player declares for their own characters, so the server
 * resolves each round by itself. Waits `pause` milliseconds after each round so the pages can play it back.
 * `opening` returns declarations by member ID that replace those for the first round. One that won't work
 * becomes a hold.
 */
async function fightOut(apis, { pause = 0, maxRounds = 20, opening = () => ({}) } = {}) {
  let game = await apis.ruth.game();
  for (let round = 0; round < maxRounds && game.mode === 'battle'; round += 1) {
    const group = firstGroup(game);
    if (group === undefined) break;
    const before = game.revision;
    const chosen = round === 0 ? opening(game) : {};
    const declarers = game.view.encounter.declarers;
    // The chosen declarations go last, so the round resolves only after any that won't work become holds.
    const order = [...declarers.filter((id) => !(id in chosen)), ...declarers.filter((id) => id in chosen)];
    for (const id of order) {
      const owner = game.seats.find((seat) => seat.member_id === id)?.user_id;
      const api = apis.byUser.get(owner) ?? apis.ruth;
      const distance = group.member_distance_feet?.[id] ?? group.distance_feet;
      const state = await api.declare(
        id,
        chosen[id] ??
          (distance > 5
            ? { action: 'move', move: 'close', target_group_id: group.id }
            : { action: 'attack', target_group_id: group.id }),
      );
      if (id in chosen && state?.refusals?.some((refusal) => refusal.member_id === id)) {
        console.log(`The opening action for ${id} won't work, so that member holds.`);
        await api.declare(id, { action: 'hold' });
      }
    }
    game = await waitForGame(apis.ruth, (next) => next.revision > before, 'the round to resolve');
    if (pause > 0) await sleep(pause);
  }
  if (game.mode === 'battle') throw new Error('The battle did not end.');
  if (game.mode !== 'exploring') throw new Error(`The battle ended in ${game.mode}, not exploring.`);
  return game;
}

/** Closes the aftermath card on a page, if it is open, once its playback has finished. */
async function closeAftermath(page) {
  const close = page.getByRole('button', { name: 'Close', exact: true });
  await close
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await page
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 1000 })
    .catch(() => {});
  await close
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await sleep(600);
}

/** Opens the scene panel's description and keeps it open. */
async function openScene(page) {
  const scene = page.getByRole('region', { name: 'Current location' });
  await scene.waitFor();
  const hide = scene.getByRole('button', { name: 'Collapse description' });
  if (await hide.isVisible()) await hide.click();
  await scene.getByRole('button', { name: 'Show description' }).click();
  await hide.waitFor();
}

/** Fails the capture when a page doesn't show the mode a screenshot needs. */
async function expectMode(page, mode) {
  await page.getByRole('banner').getByText(mode, { exact: true }).first().waitFor({ timeout: 30_000 });
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

  // Each character comes from an ability roll at the table, with its hit points and gold rolled before the
  // purchases, as the wizard makes one.
  const create = async (person, spec) => {
    const roll = await person.call('POST', `/tables/${tableId}/ability-rolls`, { seed: spec.seed });
    await person.call('POST', `/ability-rolls/${roll.id}/hit-points`, { class_id: spec.classId });
    await person.call('POST', `/ability-rolls/${roll.id}/gold`, { class_id: spec.classId });
    const character = await person.call('POST', '/characters', {
      name: spec.name,
      class_id: spec.classId,
      alignment: 'lawful',
      ability_roll_id: roll.id,
      purchases: spec.buy.map((item_id) => ({ item_id })),
      equip_item_ids: spec.equip,
    });
    await person.call('POST', `/tables/${tableId}/roster`, { character_id: character.id });
    return character;
  };
  await create(sam, {
    name: 'Flarg',
    classId: 'fighter',
    seed: 109,
    buy: ['chainmail', 'shield', 'sword', 'torch'],
    equip: ['chainmail', 'shield', 'sword'],
  });
  await create(sam, {
    name: 'Tinks',
    classId: 'thief',
    seed: 19,
    buy: ['leather', 'sword', 'thieves_tools', 'torch'],
    equip: ['leather', 'sword'],
  });
  await create(priya, {
    name: 'Clarence',
    classId: 'cleric',
    seed: 63,
    buy: ['chainmail', 'shield', 'mace', 'holy_symbol'],
    equip: ['chainmail', 'shield', 'mace'],
  });

  // Theo makes Mazpar in the wizard. The ability dice animate, so the shot waits until they land.
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
  await wizard.getByRole('button', { name: /^Roll (ability scores|abilities)$/ }).click();
  await wizard.getByRole('region', { name: 'Classes this roll qualifies for' }).waitFor();
  await sleep(4500);
  await snap(theoPage, 'wizard-roll');
  await next();
  await wizard.getByRole('button', { name: 'Magic-User', exact: true }).click();
  await next();
  await next();
  await wizard.getByRole('textbox', { name: 'Name' }).fill('Mazpar');
  await wizard.getByRole('radio', { name: 'Lawful' }).click();
  await wizard.getByRole('checkbox', { name: 'Elvish' }).click();
  await wizard.getByRole('checkbox', { name: 'Hobgoblin' }).click();
  await wizard.getByRole('button', { name: /^Sleep/ }).click();
  await next();
  await wizard.getByRole('button', { name: 'Roll hit points' }).click();
  await wizard.getByText(/You start with \d+ hit points?\./).waitFor();
  await wizard.getByRole('button', { name: 'Roll starting gold' }).click();
  await wizard.getByText(/You start with \d+ gold pieces?/).waitFor();
  await sleep(2500);
  await snap(theoPage, 'wizard-rolls');
  await next();
  await wizard.getByRole('button', { name: /^Add Dagger/ }).click();
  await wizard.getByRole('button', { name: /^Add Torches/ }).click();
  await wizard.getByRole('button', { name: /^Add Backpack/ }).click();
  await snap(theoPage, 'wizard-outfit');
  await next();
  await wizard.getByRole('button', { name: 'Create character' }).click();
  const ready = theoPage.getByRole('dialog', { name: 'Mazpar is ready' });
  await ready.waitFor({ timeout: 30_000 });
  await ready.getByRole('button', { name: 'Done' }).click();

  // The lobby, seen by the referee, with every player online.
  const samPage = await newPage(sam);
  const priyaPage = await newPage(priya);
  await samPage.goto(`${base}/tables/${tableId}`);
  await priyaPage.goto(`${base}/tables/${tableId}`);
  const ruthPage = await newPage(ruth);
  await ruthPage.goto(`${base}/tables/${tableId}`);
  await ruthPage.getByRole('button', { name: 'Start game' }).waitFor();
  await sleep(1200);
  await snap(ruthPage, 'lobby');

  // Ruth starts the game from the lobby, with everyone online.
  await ruth.call('POST', `/tables/${tableId}/game`, {
    adventure_id: 'sample:the-drowned-bell',
    seed: SESSION_SEED,
  });
  await samPage.getByRole('tab', { name: 'Outfitter' }).waitFor();
  await sleep(1500);

  // From here on, every game command that no screenshot shows goes through the API in a fixed order, so the
  // session's dice repeat from run to run.
  const apis = {
    ruth: at(ruth, tableId),
    sam: at(sam, tableId),
    priya: at(priya, tableId),
    theo: at(theo, tableId),
  };
  apis.byUser = new Map([
    [sam.user.id, apis.sam],
    [priya.user.id, apis.priya],
    [theo.user.id, apis.theo],
  ]);
  const start = await apis.ruth.game();
  const ids = Object.fromEntries(
    ['Flarg', 'Tinks', 'Clarence', 'Mazpar'].map((name) => [name, memberId(start, name)]),
  );

  // Town: Sam shops for Tinks.
  await samPage.getByRole('tab', { name: 'Outfitter' }).click();
  await samPage
    .getByRole('button', { name: /^Tinks\b.*gp/ })
    .first()
    .click();
  await samPage.getByRole('button', { name: /^Add Tinder box/ }).click();
  await samPage.getByRole('button', { name: /^Add Rations \(standard/ }).click();
  await samPage.getByRole('button', { name: /^Add Rope/ }).click();
  await samPage.getByRole('button', { name: /^Add Oil/ }).click();
  await sleep(500);
  await snap(samPage, 'town');
  await samPage.getByRole('button', { name: /^Buy for Tinks/ }).click();
  await sleep(1500);

  // The party rests a night in town. Theo opens the prepare dialog on Mazpar's Spells tab, and the API sends
  // the same choice, so Mazpar memorizes sleep.
  await apis.sam.send({ command_type: 'rest', kind: 'night' });
  await theoPage
    .getByRole('list', { name: 'Marching order' })
    .getByRole('button', { name: 'Mazpar', exact: true })
    .click();
  const theoSheet = theoPage.getByRole('dialog').last();
  await theoSheet.getByRole('tab', { name: 'Spells' }).click();
  await theoSheet.getByRole('button', { name: 'Prepare spells' }).first().click();
  const prepare = theoPage.getByRole('dialog', { name: "Prepare Mazpar's spells" });
  await prepare.getByRole('heading', { name: '1st-level spells' }).waitFor();
  await sleep(900);
  await snap(theoPage, 'spells-prepare');
  await prepare.getByRole('button', { name: 'Cancel' }).click();
  await theoPage.keyboard.press('Escape');
  await sleep(500);
  await apis.theo.send({
    command_type: 'prepare_spells',
    character_id: ids.Mazpar,
    selections: [{ spell_id: 'sleep' }],
  });

  // Set out, light a torch, and walk north into the guardroom, where two goblins wait.
  await apis.sam.send({ command_type: 'enter_dungeon', dungeon_id: 'priory' });
  // A torch can fail to catch, so Tinks strikes until one burns.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await apis.sam.send(
      { command_type: 'light_source', character_id: ids.Tinks, item_id: 'torch' },
      { refusable: true },
    );
    if (result.game.view.effects.some((effect) => effect.kind === 'light')) break;
  }
  let game = await apis.sam.game();
  for (let step = 0; step < 4 && game.mode === 'exploring'; step += 1) {
    game = (await apis.sam.send({ command_type: 'move_party', direction: 'north' })).game;
  }
  if (game.mode !== 'encounter') throw new Error(`The party met no one in the guardroom (${game.mode}).`);
  await apis.sam.send({ command_type: 'engage_battle' });

  // The battle board, as Sam sees it: Flarg and Tinks close in, so the track marks where they will stand, and
  // Clarence's attack can't reach the goblins 30 feet away, so his row says it won't work and the round waits.
  const theoPlay = theoPage;
  await theoPlay.goto(`${base}/tables/${tableId}`);
  for (const page of [samPage, priyaPage, theoPlay]) {
    await page.getByRole('button', { name: 'Actions', exact: true }).first().waitFor();
  }
  game = await apis.ruth.game();
  const goblins = firstGroup(game);
  if (goblins === undefined) throw new Error('The battle has no monsters.');
  await apis.sam.declare(ids.Flarg, { action: 'move', move: 'close', target_group_id: goblins.id });
  await apis.sam.declare(ids.Tinks, { action: 'move', move: 'close', target_group_id: goblins.id });
  await apis.priya.declare(ids.Clarence, { action: 'attack', target_group_id: goblins.id });
  await samPage
    .getByText(/^Won't work:/)
    .first()
    .waitFor();
  await sleep(1200);
  await snap(samPage, 'battle');

  // Clarence closes in instead, Mazpar holds, and the round resolves. Then the party fights it out.
  await apis.priya.declare(ids.Clarence, { action: 'move', move: 'close', target_group_id: goblins.id });
  await apis.theo.declare(ids.Mazpar, { action: 'hold' });
  await waitForGame(apis.ruth, (next) => next.revision > game.revision, 'the first round to resolve');
  await sleep(4000);
  await fightOut(apis, { pause: 1500 });
  await expectMode(samPage, 'Exploring');
  await closeAftermath(samPage);

  // Sam picks up what the goblins dropped, from the scene panel.
  await openScene(samPage);
  const scene = samPage.getByRole('region', { name: 'Current location' });
  const pickUp = scene.getByRole('button', { name: 'Pick up dropped goods' });
  if ((await pickUp.count()) > 0) {
    await pickUp.click();
    await sleep(1500);
  }

  // The table talks.
  const say = async (person, text) => {
    await person.call('POST', `/tables/${tableId}/feed`, { text });
    await sleep(250);
  };
  await say(sam, 'Torch is lit. Flarg goes first, shield up.');
  await say(priya, 'Clarence stays behind Tinks. I have the holy symbol ready if anything cold shows up.');
  await say(theo, 'Mazpar has sleep memorized and a dagger for anything that gets close.');
  await say(ruth, 'The corridor is wet underfoot. Somewhere below you, a bell tolls once.');
  await say(sam, '/roll 1d20 Tinks listens at the door');
  await sleep(600);
  await samPage.getByRole('tab', { name: /Feed/ }).click();
  await sleep(1200);
  await samPage
    .getByRole('button', { name: 'Newest' })
    .click({ timeout: 2000 })
    .catch(() => {});
  await sleep(800);
  await snap(samPage, 'feed');
  await samPage.getByRole('tab', { name: 'Party' }).click();

  // The warden's cell. Ruth places the party in the dorter, north of the cell's stuck door, as the referee's
  // Place the party tool does. Flarg forces the door, and the party steps south into Gashnak and two goblins.
  await apis.ruth.send({
    command_type: 'place_party',
    location: {
      kind: 'dungeon',
      dungeon_id: 'priory',
      level_number: 1,
      position: [26, 15],
      facing: 'south',
    },
  });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await apis.sam.send(
      { command_type: 'force_door', direction: 'south', character_id: ids.Flarg },
      { refusable: true },
    );
    const level = result.game.view.explored.find((candidate) => candidate.level_number === 1);
    if (level?.edges['26,16:north']?.door_open === true) break;
  }
  game = (await apis.sam.send({ command_type: 'move_party', direction: 'south' })).game;
  if (game.mode !== 'encounter') throw new Error(`The party met no one in the warden's cell (${game.mode}).`);
  await apis.sam.send({ command_type: 'engage_battle' });
  await samPage.getByRole('button', { name: 'Actions', exact: true }).first().waitFor();
  // Mazpar opens with sleep on the largest group.
  await fightOut(apis, {
    pause: 1500,
    opening: (battle) => {
      const groups = battle.view.encounter.groups.filter((group) => !group.fled && group.count > 0);
      const largest = groups.reduce((most, group) => (group.count > most.count ? group : most), groups[0]);
      return {
        [ids.Mazpar]: {
          action: 'cast',
          spell_id: 'sleep',
          spell_mode: 'hd_budget',
          target_group_id: largest.id,
        },
      };
    },
  });
  await expectMode(samPage, 'Exploring');
  game = await apis.sam.game();
  const fallen = game.view.party.filter((member) => member.current_hp <= 0).map((member) => member.name);
  if (fallen.length > 0) throw new Error(`${fallen.join(' and ')} fell in the warden's cell.`);

  await closeAftermath(samPage);

  // The map while exploring, with the scene panel open on the chest.
  await openScene(samPage);
  await scene.getByText(/A heavy hasp holds the lid shut/).waitFor();
  await expectMode(samPage, 'Exploring');
  await sleep(600);
  await snap(samPage, 'explore');

  // The character sheet.
  await samPage
    .getByRole('list', { name: 'Marching order' })
    .getByRole('button', { name: 'Tinks', exact: true })
    .click();
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
  await expectMode(ruthPage, 'Exploring');
  await ruthPage.getByRole('tab', { name: 'Referee', exact: true }).click();
  await ruthPage.getByRole('tab', { name: /^(Act|Quick actions)$/ }).click();
  await sleep(1200);
  await snap(ruthPage, 'referee');
}

try {
  await main();
} finally {
  await browser?.close();
  if (server !== null && server.exitCode === null) {
    const exited = new Promise((resolveExit) => server.once('exit', resolveExit));
    server.kill('SIGTERM');
    await exited;
  }
  // The game and its saves stay in bxapi until the purge deletes them.
  const { failed } = await purgeBxapi(dataDir, { bxapiUrl });
  if (failed > 0) console.warn(`${failed} bxapi resources could not be deleted.`);
  rmSync(dataDir, { recursive: true, force: true });
}
