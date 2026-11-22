/**
 * Captures the WebSocket snapshots that web tests mount features with, from a real bxvtt server and bxapi.
 *
 * It plays one short game: a referee and a player make a table, put four characters on the roster, start The
 * Drowned Bell, enter the dungeon, meet monsters, and fight. At each stage it saves the snapshot that each
 * user's browser would receive, as `<stage>-<role>.json` next to this script.
 *
 * Run it against a server that allows character seeds, so the characters come out the same each time:
 *
 *   BXVTT_PORT=8662 BXVTT_DATA_DIR=.data/fixtures BXVTT_ALLOW_CHARACTER_SEEDS=true npm run dev -w @bxvtt/server
 *   BXVTT_SERVER_URL=http://127.0.0.1:8662 npx tsx apps/web/src/app/testing/fixtures/capture-fixtures.mjs
 *
 * Then run `npx prettier --write apps/web/src/app/testing/fixtures`.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BxvttClient, TableConnection } from '../../../../../../packages/shared/src/client/index.ts';

const serverUrl = (process.env.BXVTT_SERVER_URL ?? 'http://127.0.0.1:8662').replace(/\/$/, '');
const wsUrl = `${serverUrl.replace(/^http/, 'ws')}/ws`;
const directory = fileURLToPath(new URL('.', import.meta.url));

const referee = new BxvttClient({ baseUrl: serverUrl });
const player = new BxvttClient({ baseUrl: serverUrl });

const { token: refereeToken } = await referee.createUser('Ruth');
const { token: playerToken } = await player.createUser('Sam');
const table = await referee.createTable({ name: 'Thursday at the Drowned Bell' });
await player.joinTable(table.invite_code);

/** Saves the snapshot each user would receive now. */
async function capture(stage) {
  for (const [role, token] of [
    ['referee', refereeToken],
    ['player', playerToken],
  ]) {
    const connection = new TableConnection({ url: wsUrl, token, tableId: table.id });
    const snapshot = connection.next('snapshot', () => true, 15_000);
    connection.connect();
    const message = await snapshot;
    connection.close();
    await writeFile(`${directory}${stage}-${role}.json`, `${JSON.stringify(message, null, 2)}\n`);
    console.log(`Saved ${stage}-${role}.json (mode ${message.game?.mode ?? 'lobby'})`);
  }
}

const characters = [
  [
    player,
    {
      name: 'Brenna',
      class_id: 'fighter',
      alignment: 'lawful',
      seed: 11,
      purchases: [{ item_id: 'leather' }, { item_id: 'sword' }, { item_id: 'torch' }],
      equip_item_ids: ['leather', 'sword'],
    },
  ],
  [
    player,
    {
      name: 'Wren',
      class_id: 'thief',
      alignment: 'neutral',
      seed: 12,
      purchases: [{ item_id: 'leather' }, { item_id: 'short_sword' }],
      equip_item_ids: ['leather', 'short_sword'],
    },
  ],
  [
    referee,
    {
      name: 'Osric',
      class_id: 'cleric',
      alignment: 'lawful',
      seed: 13,
      purchases: [{ item_id: 'leather' }, { item_id: 'mace' }],
      equip_item_ids: ['leather', 'mace'],
    },
  ],
  [
    referee,
    {
      name: 'Tamsin',
      class_id: 'fighter',
      alignment: 'neutral',
      seed: 14,
      purchases: [{ item_id: 'leather' }, { item_id: 'spear' }, { item_id: 'torch' }],
      equip_item_ids: ['leather', 'spear'],
    },
  ],
];
for (const [client, body] of characters) {
  const character = await client.createCharacter(body);
  await client.addToRoster(table.id, character.id);
}
await capture('lobby');

let game = await referee.startGame(table.id, { adventure_id: 'sample:the-drowned-bell', seed: 7 });
await capture('town');

const adventures = await referee.listAdventures(table.id);
const bell = adventures.items.find((item) => item.id === 'sample:the-drowned-bell');
const dungeonId = bell?.info.dungeons[0]?.id;
if (dungeonId === undefined) throw new Error('The Drowned Bell has no dungeon.');

// Sam owns the first seat, so Sam is the caller and leads the party in.
let result = await player.sendCommand(
  table.id,
  { command_type: 'enter_dungeon', dungeon_id: dungeonId },
  game.revision,
);
if (!result.accepted) throw new Error(`enter_dungeon was refused: ${JSON.stringify(result.rejections)}`);
game = result.game;
for (const direction of ['north', 'east', 'south', 'west']) {
  result = await player.sendCommand(table.id, { command_type: 'move_party', direction }, game.revision);
  game = result.game;
  if (result.accepted && game.mode === 'exploring') break;
}
await capture('exploring');

if (game.mode === 'exploring') {
  result = await referee.sendCommand(
    table.id,
    { command_type: 'spawn_monsters', template_id: 'goblin', count_fixed: 3, distance_feet: 40 },
    game.revision,
  );
  if (!result.accepted) throw new Error(`spawn_monsters was refused: ${JSON.stringify(result.rejections)}`);
  game = result.game;
}
await capture('encounter');

result = await player.sendCommand(table.id, { command_type: 'engage_battle' }, game.revision);
if (!result.accepted) throw new Error(`engage_battle was refused: ${JSON.stringify(result.rejections)}`);
game = result.game;
const declarations = await player.getDeclarations(table.id);
const target = game.view.encounter?.groups[0]?.id;
const first = declarations?.declarers[0];
if (first !== undefined && target !== undefined) {
  await player.declare(table.id, first, { action: 'attack', target_group_id: target });
}
await capture('battle');
console.log(`Table ${table.id} is in ${game.mode}.`);
