// Captures the map fixtures from a running development bxapi (anonymous mode, referee client).
//
// Run it from the repository root:
//
//   BXAPI_URL=http://127.0.0.1:8651 node apps/web/src/map/fixtures/capture-fixtures.mjs
//
// It writes `*.json` next to this file. Each fixture holds a player view and a trimmed referee
// view (the adventure, the dungeon state, and the mode), captured at the same revision. When it finishes, it deletes
// the characters, adventures, and sessions it created in bxapi.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.BXAPI_URL ?? 'http://127.0.0.1:8651';
const hillsPath =
  process.env.HILLS_ADVENTURE ??
  join(process.env.HOME ?? '', 'repos/osr-suite/osr-web/adventures/the-hills-are-alive_2.json');

async function api(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 600)}`);
  const result = JSON.parse(text);
  if (method === 'POST' && CREATES.includes(path) && typeof result.id === 'string') {
    createdPaths.push(`${path}/${encodeURIComponent(result.id)}`);
  }
  return result;
}

/** The bxapi collections whose new members the script deletes when it finishes. */
const CREATES = ['/v1/characters', '/v1/adventures', '/v1/sessions'];
/** The bxapi path of each resource the script created, oldest first. */
const createdPaths = [];

/** Deletes what the script created in bxapi, newest first, so the development bxapi doesn't keep it. */
async function removeCreated() {
  for (const path of createdPaths.reverse()) {
    await fetch(`${base}${path}`, { method: 'DELETE' }).catch(() => undefined);
  }
}

async function command(session, body, { mustAccept = true } = {}) {
  const result = await api('POST', `/v1/sessions/${session}/commands`, body);
  if (!result.accepted && mustAccept) {
    throw new Error(`${body.command_type} refused: ${JSON.stringify(result.rejections)}`);
  }
  // Keep exploring: close any encounter that a move opened.
  if (result.mode === 'encounter' || result.mode === 'battle') {
    await api('POST', `/v1/sessions/${session}/commands`, { command_type: 'end_encounter' });
  }
  return result;
}

async function capture(session, name, note) {
  const view = await api('GET', `/v1/sessions/${session}/view`);
  const referee = await api('GET', `/v1/sessions/${session}/referee-view`);
  const fixture = {
    note,
    view,
    referee: {
      mode: referee.mode,
      adventure: { name: referee.adventure.name, dungeons: referee.adventure.dungeons },
      dungeon_state: referee.dungeon_state,
    },
  };
  writeFileSync(join(here, `${name}.json`), JSON.stringify(fixture, null, 2) + '\n');
  console.log(`wrote ${name}.json`);
}

// ---------------------------------------------------------------------------------------------
// The showcase adventure: two small levels with every door, transition, and feature kind.

const DIRS = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

function edgeKey(x, y, dir) {
  if (dir === 'south') return `${x},${y + 1}:north`;
  if (dir === 'east') return `${x + 1},${y}:west`;
  return `${x},${y}:${dir}`;
}

function rectCells(x, y, w, h) {
  const cells = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells.push([i, j]);
  return cells;
}

function buildLevel({ number, width, height, rooms, paths, links, transitions, features, entrance }) {
  const edges = {};
  const open = (x, y, dir) => (edges[edgeKey(x, y, dir)] = { kind: 'open' });
  const areas = [];
  for (const room of rooms) {
    const cells = rectCells(room.x, room.y, room.w, room.h);
    const inRoom = new Set(cells.map(([i, j]) => `${i},${j}`));
    for (const [i, j] of cells) {
      if (inRoom.has(`${i + 1},${j}`)) open(i, j, 'east');
      if (inRoom.has(`${i},${j + 1}`)) open(i, j, 'south');
    }
    const { x: _x, y: _y, w: _w, h: _h, ...spec } = room;
    areas.push({ ...spec, cells });
  }
  for (const path of paths) {
    for (let k = 0; k + 1 < path.length; k++) {
      let [x, y] = path[k];
      const [tx, ty] = path[k + 1];
      while (x !== tx || y !== ty) {
        const dir = tx > x ? 'east' : tx < x ? 'west' : ty > y ? 'south' : 'north';
        open(x, y, dir);
        x += DIRS[dir][0];
        y += DIRS[dir][1];
      }
    }
  }
  for (const [x, y, dir, door] of links) {
    edges[edgeKey(x, y, dir)] = door ? { kind: 'door', door } : { kind: 'open' };
  }
  return {
    number,
    width,
    height,
    edges,
    areas,
    features: features ?? [],
    transitions: transitions ?? [],
    wandering: { chance_in_six: 0, interval_turns: 2 },
    entrance: entrance ?? null,
  };
}

const dartTrap = { kind: 'treasure', trigger: 'open', effect: { damage_dice: '1d4' }, affects: 'triggerer' };
const pitTrap = { kind: 'room', trigger: 'enter', effect: { fall_feet: 10 }, affects: 'triggerer' };
const bladeTrap = { kind: 'room', trigger: 'enter', effect: { damage_dice: '1d6' }, affects: 'triggerer' };

const level1 = buildLevel({
  number: 1,
  width: 32,
  height: 24,
  entrance: [6, 10],
  rooms: [
    {
      id: 'entry',
      name: 'Entry hall',
      description: 'Dust lies thick on a floor of cracked flagstones. An offering bowl rests on a plinth.',
      x: 4,
      y: 2,
      w: 6,
      h: 5,
      features: [
        {
          id: 'offering_bowl',
          kind: 'treasure_cache',
          description: 'A bronze bowl of old coins.',
          cell: [6, 3],
          coins: { pp: 0, gp: 12, ep: 0, sp: 30, cp: 0 },
        },
      ],
    },
    {
      id: 'closet',
      name: 'Secret closet',
      description: 'A narrow space behind the wall, stacked with forgotten crates.',
      x: 2,
      y: 2,
      w: 2,
      h: 2,
      features: [
        {
          id: 'crate_stash',
          kind: 'treasure_cache',
          cell: [2, 2],
          coins: { pp: 0, gp: 40, ep: 0, sp: 0, cp: 0 },
        },
      ],
    },
    {
      id: 'guard_post',
      name: 'Guard post',
      description: 'Bunks of rotten timber line the walls. A loose stone sits in the floor.',
      x: 14,
      y: 2,
      w: 6,
      h: 5,
      encounter: { monsters: [{ template_id: 'goblin', count_fixed: 4 }], hoard: false },
      trap: bladeTrap,
      features: [
        { id: 'loose_stone', kind: 'construction_trick', cell: [17, 5], description: 'A stone that slides.' },
      ],
    },
    {
      id: 'shrine',
      name: 'Shrine of the hollow god',
      description: 'A black altar stands under a vaulted ceiling. Its basin holds a hoard.',
      x: 24,
      y: 2,
      w: 6,
      h: 6,
      features: [
        {
          id: 'altar_hoard',
          kind: 'treasure_cache',
          cell: [27, 3],
          coins: { pp: 5, gp: 120, ep: 0, sp: 0, cp: 0 },
          trap: dartTrap,
        },
      ],
    },
    {
      id: 'pillared_hall',
      name: 'Pillared hall',
      description: 'Rows of fluted pillars hold up a sagging roof. Some flagstones are hollow.',
      x: 13,
      y: 9,
      w: 8,
      h: 6,
      trap: pitTrap,
      treasure: { letters: [], unguarded: true },
    },
    {
      id: 'stair_room',
      name: 'Stair chamber',
      description: 'Worn steps spiral down into the dark.',
      x: 24,
      y: 15,
      w: 5,
      h: 5,
      encounter: { monsters: [{ template_id: 'skeleton', count_fixed: 3 }], hoard: true },
    },
    {
      id: 'grotto',
      name: 'Hidden grotto',
      description: 'Water drips into a still pool.',
      x: 2,
      y: 17,
      w: 5,
      h: 5,
      features: [{ id: 'pool', kind: 'custom', cell: [4, 19], description: 'A still, clear pool.' }],
    },
  ],
  paths: [
    [
      [6, 10],
      [6, 7],
    ],
    [
      [6, 9],
      [12, 9],
    ],
    [
      [10, 4],
      [13, 4],
    ],
    [
      [20, 3],
      [23, 3],
    ],
    [
      [16, 7],
      [16, 8],
    ],
    [
      [26, 8],
      [26, 14],
    ],
    [
      [26, 12],
      [21, 12],
    ],
    [
      [16, 15],
      [16, 20],
    ],
    [
      [23, 17],
      [21, 17],
    ],
  ],
  links: [
    [6, 7, 'north', null],
    [3, 3, 'east', { kind: 'secret' }],
    [9, 4, 'east', { kind: 'normal' }],
    [13, 4, 'east', { kind: 'normal', stuck: true }],
    [19, 3, 'east', { kind: 'normal', locked: true }],
    [23, 3, 'east', null],
    [16, 6, 'south', null],
    [16, 8, 'south', { kind: 'normal' }],
    [12, 9, 'east', null],
    [26, 7, 'south', { kind: 'normal', locked: true, stuck: true }],
    [21, 12, 'west', null],
    [26, 14, 'south', { kind: 'normal', starts_open: true }],
    [16, 14, 'south', null],
    [24, 17, 'west', { kind: 'secret' }],
  ],
  features: [{ id: 'carved_face', kind: 'custom', cell: [6, 8], description: 'A face carved in the wall.' }],
  transitions: [
    {
      kind: 'stairs_down',
      position: [26, 17],
      to_dungeon_id: 'vault',
      to_level_number: 2,
      to_position: [3, 3],
      to_facing: 'east',
    },
    {
      kind: 'trapdoor',
      position: [16, 18],
      to_dungeon_id: 'vault',
      to_level_number: 2,
      to_position: [10, 8],
      to_facing: 'south',
    },
    {
      kind: 'passage',
      position: [16, 20],
      side: 'west',
      to_dungeon_id: 'vault',
      to_level_number: 1,
      to_position: [6, 19],
      to_facing: 'west',
    },
  ],
});

const level2 = buildLevel({
  number: 2,
  width: 20,
  height: 14,
  rooms: [
    {
      id: 'landing',
      name: 'Landing',
      description: 'The stairs end in a round chamber.',
      x: 1,
      y: 1,
      w: 5,
      h: 5,
    },
    {
      id: 'pit_cell',
      name: 'Pit cell',
      description: 'A cell with no door handle on the inside.',
      x: 8,
      y: 7,
      w: 5,
      h: 4,
    },
  ],
  paths: [
    [
      [6, 3],
      [10, 3],
      [10, 6],
    ],
  ],
  links: [
    [5, 3, 'east', null],
    [10, 6, 'south', { kind: 'normal' }],
  ],
  transitions: [
    {
      kind: 'stairs_up',
      position: [3, 3],
      to_dungeon_id: 'vault',
      to_level_number: 1,
      to_position: [26, 17],
      to_facing: 'west',
    },
    {
      kind: 'chute',
      position: [12, 10],
      to_dungeon_id: 'vault',
      to_level_number: 1,
      to_position: [17, 11],
      to_facing: 'north',
    },
  ],
});

const showcase = {
  kind: 'adventure',
  schema_version: 3,
  engine_version: '2.5.0',
  payload: {
    name: 'The Showcase Vault',
    description: 'A test dungeon with every kind of door, transition, and feature.',
    town: { name: 'Testwell', description: 'A town for tests.' },
    dungeons: [{ id: 'vault', name: 'The Showcase Vault', levels: [level1, level2] }],
  },
};

// ---------------------------------------------------------------------------------------------

async function makeParty() {
  const specs = [
    ['Brenna', 'fighter', 'lawful', ['torch', 'tinder_box', 'sword', 'iron_spikes', 'dagger']],
    ['Durin', 'dwarf', 'lawful', ['axe_placeholder']],
    ['Elowen', 'elf', 'neutral', ['sword'], ['sleep']],
    ['Wren', 'thief', 'neutral', ['dagger', 'thieves_tools']],
  ];
  const ids = [];
  for (const [name, class_id, alignment, items, spells] of specs) {
    const purchases = items
      .filter((id) => id !== 'axe_placeholder')
      .map((item_id) => ({ item_id, quantity: item_id === 'torch' ? 2 : 1 }));
    let created;
    for (let seed = 1; seed < 60 && !created; seed++) {
      try {
        created = await api('POST', '/v1/characters', {
          name,
          class_id,
          alignment,
          purchases,
          starting_spell_ids: spells ?? [],
          seed: seed * 17,
        });
      } catch (error) {
        if (!String(error).includes('422')) throw error;
      }
    }
    if (!created) throw new Error(`could not create ${name}`);
    ids.push(created.id);
  }
  return ids;
}

async function uploadAdventure(document) {
  const check = await api('POST', '/v1/adventures/validate', document);
  if (!check.valid) throw new Error(`adventure invalid: ${JSON.stringify(check).slice(0, 2000)}`);
  const uploaded = await api('POST', '/v1/adventures', document);
  return uploaded.id;
}

// Light a fresh torch when the last one has burned out.
// A tinder box lights on 2 in 6, so keep striking.
async function ensureLight(session, member) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const view = await api('GET', `/v1/sessions/${session}/view`);
    if (view.effects.some((effect) => effect.kind === 'light')) return;
    await command(
      session,
      { command_type: 'light_source', character_id: member, item_id: 'torch' },
      { mustAccept: false },
    );
  }
}

const place = (session, dungeon_id, level_number, position, facing = 'north') =>
  command(session, {
    command_type: 'place_party',
    location: { kind: 'dungeon', dungeon_id, level_number, position, facing },
  });

async function main() {
  writeFileSync(join(here, 'showcase-adventure.json'), JSON.stringify(showcase, null, 2) + '\n');
  const party = await makeParty();

  // Barrow: the built-in two-level adventure, after a few steps.
  {
    const { id } = await api('POST', '/v1/sessions', {
      adventure_id: 'builtin-barrow',
      character_ids: party,
      seed: 11,
    });
    const members = (await api('GET', `/v1/sessions/${id}/view`)).party.map((m) => m.id);
    await command(id, { command_type: 'enter_dungeon', dungeon_id: 'barrow' });
    await ensureLight(id, members[0]);
    await command(id, { command_type: 'move_party', direction: 'east' });
    await capture(id, 'barrow', 'builtin-barrow after entering, lighting a torch, and one step east.');
  }

  // Showcase.
  const showcaseId = await uploadAdventure(showcase);
  const { id: s } = await api('POST', '/v1/sessions', {
    adventure_id: showcaseId,
    character_ids: party,
    seed: 7,
  });
  const ids = (await api('GET', `/v1/sessions/${s}/view`)).party.map((m) => m.id);
  const [m1, m2, m3, m4] = ids;
  await command(s, { command_type: 'enter_dungeon', dungeon_id: 'vault' });
  await capture(s, 'showcase-dark', 'Showcase vault just after entering, before any light.');
  await ensureLight(s, m1);
  await command(s, { command_type: 'move_party', direction: 'north' });
  await command(s, { command_type: 'drop_items', character_id: m1, item_ids: ['dagger'] });
  await command(s, { command_type: 'move_party', direction: 'north' });
  await command(s, { command_type: 'move_party', direction: 'north' });
  await command(s, { command_type: 'move_party', direction: 'north' });
  await command(s, { command_type: 'move_party', direction: 'north' });
  await command(s, { command_type: 'move_party', direction: 'north' });
  await command(s, { command_type: 'move_party', direction: 'north' });
  await command(s, { command_type: 'take_treasure', feature_id: 'offering_bowl' }, { mustAccept: false });
  // Reveal the secret closet door and leave the other secret door hidden.
  await command(s, {
    command_type: 'set_door_state',
    dungeon_id: 'vault',
    level_number: 1,
    x: 4,
    y: 3,
    direction: 'west',
    discovered: true,
  });
  // East door out of the entry hall: open it and walk to the stuck door.
  await place(s, 'vault', 1, [9, 4], 'east');
  await command(s, { command_type: 'open_door', direction: 'east' });
  await command(s, { command_type: 'move_party', direction: 'east' });
  await command(s, { command_type: 'move_party', direction: 'east' });
  await command(s, { command_type: 'move_party', direction: 'east' });
  await command(s, { command_type: 'move_party', direction: 'east' });
  // The guard post: open the stuck door with the referee tool and look in.
  await command(s, {
    command_type: 'set_door_state',
    dungeon_id: 'vault',
    level_number: 1,
    x: 13,
    y: 4,
    direction: 'east',
    open: true,
  });
  // Search the guard post for its trap from cell after cell until someone finds it.
  searching: for (const cell of [
    [16, 4],
    [17, 5],
    [15, 3],
    [18, 3],
    [15, 5],
    [18, 5],
    [16, 2],
    [17, 3],
  ]) {
    await place(s, 'vault', 1, cell, 'south');
    await ensureLight(s, m1);
    for (const member of [m2, m1, m3, m4]) {
      await command(
        s,
        { command_type: 'search', character_id: member, kind: 'room_traps' },
        { mustAccept: false },
      );
      const state = await api('GET', `/v1/sessions/${s}/referee-view`);
      if (state.dungeon_state.found_traps.length > 0) break searching;
    }
  }
  // Only a dwarf can find a construction trick. Try from several cells.
  for (const cell of [
    [17, 5],
    [16, 5],
    [18, 5],
    [17, 4],
    [16, 3],
    [18, 4],
    [15, 4],
    [19, 4],
  ]) {
    await place(s, 'vault', 1, cell, 'south');
    await command(
      s,
      { command_type: 'search', character_id: m2, kind: 'construction' },
      { mustAccept: false },
    );
    const state = await api('GET', `/v1/sessions/${s}/referee-view`);
    if (state.dungeon_state.found_tricks.length > 0) break;
  }
  await ensureLight(s, m1);
  // South out of the guard post, through a door that the party opens and wedges.
  await place(s, 'vault', 1, [16, 8], 'south');
  await command(s, { command_type: 'open_door', direction: 'south' });
  await command(s, { command_type: 'wedge_door', direction: 'south' }, { mustAccept: false });
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'west' });
  // The shrine, through the locked door: the thief inspects the altar hoard.
  await command(s, {
    command_type: 'set_door_state',
    dungeon_id: 'vault',
    level_number: 1,
    x: 19,
    y: 3,
    direction: 'east',
    unlocked: true,
  });
  await place(s, 'vault', 1, [27, 3], 'east');
  await ensureLight(s, m1);
  await command(
    s,
    { command_type: 'inspect_treasure', character_id: m4, feature_id: 'altar_hoard' },
    { mustAccept: false },
  );
  // Corridors on the east side and the stair chamber.
  await place(s, 'vault', 1, [26, 10], 'south');
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'west' });
  await command(s, { command_type: 'move_party', direction: 'west' });
  await place(s, 'vault', 1, [26, 13], 'south');
  await command(s, { command_type: 'move_party', direction: 'south' });
  await place(s, 'vault', 1, [26, 16], 'south');
  // Walk the pillared hall until its pit trap springs.
  await place(s, 'vault', 1, [14, 11], 'east');
  for (let k = 0; k < 24; k++) {
    await command(
      s,
      { command_type: 'move_party', direction: k % 2 === 0 ? 'east' : 'west' },
      { mustAccept: false },
    );
    const state = await api('GET', `/v1/sessions/${s}/referee-view`);
    if (state.dungeon_state.sprung_traps.length > 0) break;
  }
  await ensureLight(s, m1);
  // Back into the pillared hall, facing south toward the trapdoor corridor.
  await place(s, 'vault', 1, [16, 13], 'south');
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'south' });
  await ensureLight(s, m1);
  await capture(
    s,
    'showcase-explored',
    'Showcase vault level 1 after exploring most rooms with a torch lit.',
  );

  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'move_party', direction: 'south' });
  await command(s, { command_type: 'use_stairs' });
  await ensureLight(s, m1);
  await command(s, { command_type: 'move_party', direction: 'east' }, { mustAccept: false });
  await capture(s, 'showcase-level2', 'Showcase vault after dropping through the trapdoor to level 2.');

  // Hills: the large two-level adventure, revealed by placing the party in each area with a torch.
  const hills = JSON.parse(readFileSync(hillsPath, 'utf8'));
  const hillsId = await uploadAdventure(hills);
  const { id: h } = await api('POST', '/v1/sessions', {
    adventure_id: hillsId,
    character_ids: party,
    seed: 5,
  });
  const hm = (await api('GET', `/v1/sessions/${h}/view`)).party.map((m) => m.id);
  const dungeon = hills.payload.dungeons[0];
  await command(h, { command_type: 'enter_dungeon', dungeon_id: dungeon.id });
  await ensureLight(h, hm[0]);
  const top = dungeon.levels[0];
  const skip = new Set([
    'vault-of-the-second-dawn',
    'gallery-of-nine-kings',
    'treasury-of-the-moulted-feather',
  ]);
  for (const area of top.areas) {
    if (skip.has(area.id)) continue;
    const cell = area.cells[Math.floor(area.cells.length / 2)];
    await place(h, dungeon.id, top.number, cell, 'north');
  }
  for (const [key, edge] of Object.entries(top.edges).slice(0, 400)) {
    if (edge.kind !== 'door') continue;
    const [pos, side] = key.split(':');
    const [x, y] = pos.split(',').map(Number);
    if ((x + y) % 2 === 0) {
      await command(
        h,
        {
          command_type: 'set_door_state',
          dungeon_id: dungeon.id,
          level_number: top.number,
          x,
          y,
          direction: side,
          open: true,
        },
        { mustAccept: false },
      );
    }
  }
  await place(h, dungeon.id, top.number, top.entrance, 'north');
  await command(h, { command_type: 'move_party', direction: 'north' }, { mustAccept: false });
  await capture(
    h,
    'hills',
    'The Hills Are Alive, level 1 mostly revealed by placing a lit party in each area.',
  );
}

try {
  await main();
} finally {
  await removeCreated();
}
