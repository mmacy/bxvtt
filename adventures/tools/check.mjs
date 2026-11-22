// Check the adventure documents in adventures/ against a running bxapi server.
//
// Usage: node adventures/tools/check.mjs [--url http://127.0.0.1:8651] [--no-maps] [file.json ...]
//
// For each document, the tool:
//   1. validates it with POST /v1/adventures/validate,
//   2. draws each level as text,
//   3. walks the map from the entrance through open edges, doors, stairs, trapdoors, passages, and
//      trap chutes, and reports any area it can't reach or any transition that lands on rock,
//   4. uploads the document, starts sessions with a generated party, and plays: it takes every
//      transition, walks into every area that has monsters and checks that the encounter starts,
//      and completes every quest objective by objective.
// It deletes the sessions and adventures it creates, and exits with status 1 when a check fails.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DIRECTIONS, edgeOf, opposite, renderLevel, step } from './lib.mjs';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const baseUrl = (urlIndex >= 0 ? args[urlIndex + 1] : process.env.BXAPI_URL) ?? 'http://127.0.0.1:8651';
const showMaps = !args.includes('--no-maps');
const files = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--url');
const adventuresDir = new URL('..', import.meta.url).pathname;
const targets = files.length
  ? files.map((file) => resolve(file))
  : readdirSync(adventuresDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(adventuresDir, name));

// ---------------------------------------------------------------------------------------------
// Reporting.

let failures = 0;
const report = {
  section(title) {
    console.log(`\n== ${title}`);
  },
  pass(message) {
    console.log(`  ok    ${message}`);
  },
  fail(message) {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  },
  note(message) {
    console.log(`  note  ${message}`);
  },
};

// ---------------------------------------------------------------------------------------------
// The HTTP client.

async function request(method, path, body) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (response.status === 409 && json?.code === 'session_busy') continue;
    return { status: response.status, body: json };
  }
  throw new Error(`${method} ${path}: the session stayed busy`);
}

async function mustRequest(method, path, body, expected) {
  const { status, body: json } = await request(method, path, body);
  if (status !== expected) throw new Error(`${method} ${path} returned ${status}: ${JSON.stringify(json)}`);
  return json;
}

// ---------------------------------------------------------------------------------------------
// Geometry from the document.

const cellKey = (dungeonId, levelNumber, [x, y]) => `${dungeonId}:${levelNumber}:${x},${y}`;
const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];

function levelOf(adventure, dungeonId, number) {
  return adventure.dungeons.find((d) => d.id === dungeonId)?.levels.find((l) => l.number === number);
}

function areaAt(level, cell) {
  return level.areas.find((area) => area.cells.some((c) => sameCell(c, cell))) ?? null;
}

function inBounds(level, [x, y]) {
  return x >= 0 && y >= 0 && x < level.width && y < level.height;
}

// A cell the party can stand on: in an area, on an edge that isn't a wall, or under a transition.
function carvedCells(level) {
  const cells = new Set();
  for (const area of level.areas) for (const cell of area.cells) cells.add(`${cell[0]},${cell[1]}`);
  for (const edge of Object.keys(level.edges)) {
    const [cellPart, side] = edge.split(':');
    const cell = cellPart.split(',').map(Number);
    cells.add(`${cell[0]},${cell[1]}`);
    const other = step(cell, side);
    cells.add(`${other[0]},${other[1]}`);
  }
  for (const transition of level.transitions)
    cells.add(`${transition.position[0]},${transition.position[1]}`);
  if (level.entrance) cells.add(`${level.entrance[0]},${level.entrance[1]}`);
  return cells;
}

function isCarved(level, cell) {
  return carvedCells(level).has(`${cell[0]},${cell[1]}`);
}

// Every way out of a cell: [kind, destination dungeon, level number, cell].
function exits(adventure, dungeonId, level, cell) {
  const out = [];
  for (const direction of DIRECTIONS) {
    const passage = level.transitions.find(
      (t) => t.kind === 'passage' && sameCell(t.position, cell) && t.side === direction,
    );
    if (passage) {
      out.push(['passage', passage.to_dungeon_id, passage.to_level_number, passage.to_position]);
      continue;
    }
    const edge = edgeOf(level, cell, direction);
    if (edge.kind === 'open' || edge.kind === 'door')
      out.push([edge.kind, dungeonId, level.number, step(cell, direction)]);
  }
  const stairs = level.transitions.find((t) => t.kind !== 'passage' && sameCell(t.position, cell));
  if (stairs) out.push([stairs.kind, stairs.to_dungeon_id, stairs.to_level_number, stairs.to_position]);
  const area = areaAt(level, cell);
  const chute = area?.trap?.effect?.transition;
  if (chute) out.push(['trap', chute.to_dungeon_id, chute.to_level_number, chute.to_position]);
  return out;
}

function staticChecks(adventure) {
  report.section('Map: reachability from each entrance');
  for (const dungeon of adventure.dungeons) {
    const entranceLevel = dungeon.levels.find((level) => level.entrance);
    const seen = new Set();
    const queue = [[dungeon.id, entranceLevel.number, entranceLevel.entrance]];
    seen.add(cellKey(dungeon.id, entranceLevel.number, entranceLevel.entrance));
    while (queue.length) {
      const [dungeonId, levelNumber, cell] = queue.shift();
      const level = levelOf(adventure, dungeonId, levelNumber);
      for (const [, toDungeon, toLevel, toCell] of exits(adventure, dungeonId, level, cell)) {
        const id = cellKey(toDungeon, toLevel, toCell);
        if (!seen.has(id)) {
          seen.add(id);
          queue.push([toDungeon, toLevel, toCell]);
        }
      }
    }
    for (const level of dungeon.levels) {
      const unreachable = level.areas.filter(
        (area) => !area.cells.some((cell) => seen.has(cellKey(dungeon.id, level.number, cell))),
      );
      const carved = [...carvedCells(level)].filter((k) => !seen.has(`${dungeon.id}:${level.number}:${k}`));
      if (unreachable.length) {
        report.fail(
          `${dungeon.id} level ${level.number}: unreachable areas ${unreachable.map((a) => a.id).join(', ')}`,
        );
      } else {
        report.pass(`${dungeon.id} level ${level.number}: all ${level.areas.length} areas are reachable`);
      }
      if (carved.length)
        report.note(`${dungeon.id} level ${level.number}: unreachable cells ${carved.join(' ')}`);
    }
  }

  report.section('Map: doors and transitions');
  for (const dungeon of adventure.dungeons) {
    for (const level of dungeon.levels) {
      const where = `${dungeon.id} level ${level.number}`;
      const doors = Object.values(level.edges).filter((edge) => edge.kind === 'door');
      const kinds = {
        secret: doors.filter((e) => e.door.kind === 'secret').length,
        locked: doors.filter((e) => e.door.locked).length,
        stuck: doors.filter((e) => e.door.stuck).length,
        gated: doors.filter((e) => e.door.requires).length,
        open: doors.filter((e) => e.door.starts_open).length,
      };
      report.note(
        `${where}: ${level.areas.length} areas, ${doors.length} doors (${Object.entries(kinds)
          .map(([k, n]) => `${n} ${k}`)
          .join(', ')}), ${level.transitions.length} transitions`,
      );
      const chutes = level.areas
        .filter((area) => area.trap?.effect?.transition)
        .map((area) => ({ ...area.trap.effect.transition, from: `trap in ${area.id}` }));
      for (const transition of [...level.transitions, ...chutes]) {
        const target = levelOf(adventure, transition.to_dungeon_id, transition.to_level_number);
        const label =
          `${where}: ${transition.kind} at (${transition.position}) ${transition.from ?? ''}`.trim();
        if (!target || !inBounds(target, transition.to_position)) {
          report.fail(`${label} leads off the map`);
        } else if (!isCarved(target, transition.to_position)) {
          report.fail(`${label} lands on solid rock at (${transition.to_position})`);
        } else {
          const back = target.transitions.some(
            (t) =>
              t.to_dungeon_id === dungeon.id &&
              t.to_level_number === level.number &&
              sameCell(t.position, transition.to_position),
          );
          report.pass(
            `${label} lands on ${transition.to_dungeon_id} level ${transition.to_level_number} (${transition.to_position})${back ? '' : ', one way'}`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Play.

class Session {
  constructor(adventure, id) {
    this.adventure = adventure;
    this.id = id;
    this.view = null;
    this.mode = 'town';
    this.notes = [];
  }

  async command(body) {
    const outcome = await mustRequest(
      'POST',
      `/v1/sessions/${this.id}/commands?include=view&visibility=referee`,
      body,
      200,
    );
    this.view = outcome.view;
    this.mode = outcome.mode;
    for (const event of outcome.events) {
      if (event.code === 'session.note.recorded') this.notes.push(event.text);
    }
    return outcome;
  }

  async must(body, what) {
    const outcome = await this.command(body);
    if (!outcome.accepted) {
      throw new Error(`${what ?? body.command_type} was refused: ${JSON.stringify(outcome.rejections)}`);
    }
    return outcome;
  }

  async referee() {
    return mustRequest('GET', `/v1/sessions/${this.id}/referee-view`, undefined, 200);
  }

  get first() {
    return this.view.party.find((member) => !member.conditions.includes('dead')) ?? this.view.party[0];
  }

  async refresh() {
    this.view = await mustRequest('GET', `/v1/sessions/${this.id}/view`, undefined, 200);
    this.mode = this.view.mode;
  }

  // Close any open encounter, so the referee commands that move the party are legal.
  async calm() {
    if (this.mode === 'encounter' || this.mode === 'battle') {
      await this.must({ command_type: 'end_encounter', outcome: 'departed', resolve_area: false });
    }
    if (this.mode === 'game_over') throw new Error('the party died');
    // A member who is asleep or paralysed stops the party from moving. Let time pass.
    for (let turn = 0; turn < 12; turn += 1) {
      const stuck = this.view?.party.some(
        (m) =>
          !m.conditions.includes('dead') &&
          m.conditions.some((c) => ['asleep', 'paralysed', 'entangled'].includes(c)),
      );
      if (!stuck) break;
      await this.must({ command_type: 'advance_time', n: 1, unit: 'turn' });
      if (this.mode === 'encounter' || this.mode === 'battle') {
        await this.must({ command_type: 'end_encounter', outcome: 'departed', resolve_area: false });
      }
    }
  }

  async place(dungeonId, levelNumber, position, facing = 'north') {
    await this.calm();
    return this.must({
      command_type: 'place_party',
      location: { kind: 'dungeon', dungeon_id: dungeonId, level_number: levelNumber, position, facing },
    });
  }

  async toTown() {
    await this.calm();
    return this.must({ command_type: 'place_party', location: { kind: 'town' } });
  }

  async openDoor(dungeonId, levelNumber, [x, y], direction) {
    return this.must({
      command_type: 'set_door_state',
      dungeon_id: dungeonId,
      level_number: levelNumber,
      x,
      y,
      direction,
      open: true,
      discovered: true,
      unlocked: true,
    });
  }

  location() {
    return this.view.location;
  }

  at(dungeonId, levelNumber, cell) {
    const location = this.location();
    return (
      location.kind === 'dungeon' &&
      location.dungeon_id === dungeonId &&
      location.level_number === levelNumber &&
      sameCell(location.position, cell)
    );
  }

  carries(itemId) {
    return this.view.party.some((member) => JSON.stringify(member.inventory).includes(`"${itemId}"`));
  }
}

async function newSession(adventureId, adventure, party) {
  const info = await mustRequest(
    'POST',
    '/v1/sessions',
    { adventure_id: adventureId, party_document: party, seed: 20261121 },
    201,
  );
  const session = new Session(adventure, info.id);
  await session.refresh();
  return session;
}

// A party of generated first-level characters, raised to level 8 with 150 hit points so that the
// checks can walk into every trap and fight every monster without the party dying.
async function generateParty() {
  const kits = [
    ['fighter', ['sword', 'chainmail', 'shield'], ['sword', 'chainmail', 'shield']],
    ['cleric', ['mace', 'chainmail', 'shield', 'holy_symbol'], ['mace', 'chainmail', 'shield']],
    ['thief', ['sword', 'leather', 'thieves_tools'], ['sword', 'leather']],
    ['dwarf', ['war_hammer', 'chainmail', 'shield'], ['war_hammer', 'chainmail', 'shield']],
  ];
  const characters = [];
  for (const [classId, purchases, equip] of kits) {
    const generated = await mustRequest(
      'POST',
      '/v1/generate/character',
      {
        name: `Checker ${classId}`,
        class_id: classId,
        alignment: 'lawful',
        purchases: purchases.map((item_id) => ({ item_id })),
        equip_item_ids: equip,
        seed: 7,
      },
      200,
    );
    const character = generated.character;
    character.level = 8;
    character.max_hp = 150;
    character.current_hp = 150;
    characters.push(character);
  }
  const meta = await mustRequest('GET', '/v1/meta', undefined, 200);
  return {
    kind: 'party',
    schema_version: meta.schema_version,
    engine_version: meta.engine_version,
    payload: { characters },
  };
}

// Fight the open encounter until it ends.
async function fight(session) {
  if (session.mode === 'encounter') await session.must({ command_type: 'engage_battle' });
  for (let round = 0; round < 80 && session.mode === 'battle'; round += 1) {
    const encounter = session.view.encounter;
    const target = encounter.groups.find((group) => group.count > 0 && !group.fled) ?? encounter.groups[0];
    const rates = Object.fromEntries(session.view.party.map((m) => [m.id, m.encounter_rate_feet]));
    const declare = (id) => {
      if (target.front_rank.includes(id))
        return { character_id: id, action: 'attack', target_group_id: target.id };
      const distance = target.member_distance_feet[id] ?? 999;
      if (distance <= rates[id] + 5) {
        return { character_id: id, action: 'attack', target_group_id: target.id, move: 'close' };
      }
      return { character_id: id, action: 'move', move: 'close', target_group_id: target.id };
    };
    let declarations = encounter.declarers.map(declare);
    let outcome = await session.command({ command_type: 'resolve_battle_round', declarations });
    if (!outcome.accepted) {
      const refused = new Set(outcome.rejections.map((r) => r.params?.character).filter(Boolean));
      declarations = declarations.map((d) =>
        refused.size === 0 || refused.has(d.character_id)
          ? { character_id: d.character_id, action: 'hold' }
          : d,
      );
      outcome = await session.command({ command_type: 'resolve_battle_round', declarations });
      if (!outcome.accepted)
        throw new Error(`a battle round was refused: ${JSON.stringify(outcome.rejections)}`);
    }
  }
  if (session.mode === 'battle') throw new Error('the battle did not end in 80 rounds');
  if (session.mode === 'game_over') throw new Error('the party died in battle');
}

// Find a way into an area from a cell outside it: [outside cell, direction into the area, edge].
function approaches(level, area) {
  const out = [];
  for (const cell of area.cells) {
    for (const direction of DIRECTIONS) {
      const outside = step(cell, direction);
      if (!inBounds(level, outside) || areaAt(level, outside) === area) continue;
      const edge = edgeOf(level, cell, direction);
      if (edge.kind === 'open' || edge.kind === 'door') out.push([outside, opposite(direction), edge]);
    }
  }
  return out.sort(([, , a], [, , b]) => (a.kind === 'open' ? 0 : 1) - (b.kind === 'open' ? 0 : 1));
}

// Walk the party into an area from outside, so the engine runs its arrival checks.
async function enterArea(session, dungeonId, level, area) {
  const [way] = approaches(level, area);
  if (way) {
    const [outside, direction, edge] = way;
    await session.place(dungeonId, level.number, outside, direction);
    if (edge.kind === 'door') await session.openDoor(dungeonId, level.number, outside, direction);
    return session.must({ command_type: 'move_party', direction }, `the move into ${area.id}`);
  }
  // No neighbouring cell: arrive by a transition that lands in the area.
  for (const dungeon of session.adventure.dungeons) {
    for (const from of dungeon.levels) {
      for (const transition of from.transitions) {
        if (
          transition.to_dungeon_id === dungeonId &&
          transition.to_level_number === level.number &&
          area.cells.some((cell) => sameCell(cell, transition.to_position))
        ) {
          return takeTransition(session, dungeon.id, from, transition);
        }
      }
    }
  }
  throw new Error(`no way into area ${area.id}`);
}

async function satisfyGate(session, gate) {
  if (!gate) return;
  const condition = gate.condition;
  if (condition.condition_type === 'has_item') {
    await session.must({
      command_type: 'grant_item',
      character_id: session.first.id,
      item_id: condition.item_id,
    });
  } else if (condition.condition_type === 'flag_equals') {
    await satisfyFlag(session, condition.key, condition.value);
  }
}

async function takeTransition(session, dungeonId, level, transition) {
  await session.place(dungeonId, level.number, transition.position, transition.side ?? 'north');
  await satisfyGate(session, transition.requires);
  await session.place(dungeonId, level.number, transition.position, transition.side ?? 'north');
  if (transition.kind === 'passage') {
    return session.must({ command_type: 'move_party', direction: transition.side }, 'the passage');
  }
  return session.must({ command_type: 'use_stairs' }, `the ${transition.kind}`);
}

function findArea(adventure, dungeonId, levelNumber, areaId) {
  const level = levelOf(adventure, dungeonId, levelNumber);
  return [level, level.areas.find((area) => area.id === areaId)];
}

async function satisfyFlag(session, key, value) {
  const referee = await session.referee();
  if (referee.flags[key] === value) return;
  const setter = session.adventure.triggers.find((trigger) =>
    trigger.consequences.some((c) => c.command_type === 'set_flag' && c.key === key && c.value === value),
  );
  if (!setter) throw new Error(`nothing in the adventure sets flag ${key} to ${JSON.stringify(value)}`);
  await satisfy(session, setter.when, setter.conditions);
}

// Make the event a pattern matches happen, after making its conditions hold.
async function satisfy(session, pattern, conditions = []) {
  const adventure = session.adventure;
  for (const condition of conditions) {
    if (condition.condition_type === 'has_item' && !session.carries(condition.item_id)) {
      await satisfy(session, { pattern_type: 'item_acquired', item_id: condition.item_id });
    } else if (condition.condition_type === 'flag_equals') {
      await satisfyFlag(session, condition.key, condition.value);
    }
  }
  switch (pattern.pattern_type) {
    case 'dungeon_entered': {
      if (session.mode !== 'town') await session.toTown();
      return session.must({ command_type: 'enter_dungeon', dungeon_id: pattern.dungeon_id });
    }
    case 'town_entered':
      return session.toTown();
    case 'level_entered': {
      for (const dungeon of adventure.dungeons) {
        for (const level of dungeon.levels) {
          if (dungeon.id === pattern.dungeon_id && level.number === pattern.level_number) continue;
          const transition = level.transitions.find(
            (t) => t.to_dungeon_id === pattern.dungeon_id && t.to_level_number === pattern.level_number,
          );
          if (transition) return takeTransition(session, dungeon.id, level, transition);
        }
      }
      return satisfy(session, { pattern_type: 'dungeon_entered', dungeon_id: pattern.dungeon_id });
    }
    case 'area_entered': {
      const [level, area] = findArea(adventure, pattern.dungeon_id, pattern.level_number, pattern.area_id);
      return enterArea(session, pattern.dungeon_id, level, area);
    }
    case 'item_acquired': {
      for (const dungeon of adventure.dungeons) {
        for (const level of dungeon.levels) {
          const holders = [
            ...level.areas.flatMap((area) => area.features.map((feature) => [area, feature])),
            ...level.features.map((feature) => [null, feature]),
          ];
          for (const [area, feature] of holders) {
            if (![...feature.item_ids, ...feature.magic_item_ids].includes(pattern.item_id)) continue;
            if (area) {
              await enterArea(session, dungeon.id, level, area);
              await session.calm();
            }
            await session.place(dungeon.id, level.number, feature.cell ?? area.cells[0]);
            return session.must(
              { command_type: 'take_treasure', feature_id: feature.id, recipient_id: session.first.id },
              `taking ${feature.id}`,
            );
          }
        }
      }
      throw new Error(`no treasure cache holds item ${pattern.item_id}`);
    }
    case 'monster_defeated': {
      for (const dungeon of adventure.dungeons) {
        for (const level of dungeon.levels) {
          const area = level.areas.find((a) =>
            a.encounter?.monsters.some((m) => m.template_id === pattern.template_id),
          );
          if (!area) continue;
          const outcome = await enterArea(session, dungeon.id, level, area);
          if (session.mode !== 'encounter' && session.mode !== 'battle') {
            throw new Error(`entering ${area.id} started no encounter`);
          }
          await fight(session);
          return outcome;
        }
      }
      report.note(`no keyed area holds a ${pattern.template_id}, so the checker spawns one to fight`);
      await session.must({
        command_type: 'spawn_monsters',
        template_id: pattern.template_id,
        count_fixed: 1,
        distance_feet: 10,
      });
      return fight(session);
    }
    case 'flag_set':
      return satisfyFlag(session, pattern.key, pattern.value);
    default:
      throw new Error(`the checker can't make a ${pattern.pattern_type} event happen`);
  }
}

async function playTransitions(session) {
  report.section('Play: every transition');
  const adventure = session.adventure;
  for (const dungeon of adventure.dungeons) {
    for (const level of dungeon.levels) {
      for (const transition of level.transitions) {
        const label = `${dungeon.id} level ${level.number}: ${transition.kind} at (${transition.position})`;
        try {
          await takeTransition(session, dungeon.id, level, transition);
          if (session.at(transition.to_dungeon_id, transition.to_level_number, transition.to_position)) {
            report.pass(
              `${label} took the party to level ${transition.to_level_number} (${transition.to_position})`,
            );
          } else {
            report.fail(`${label} left the party at ${JSON.stringify(session.location())}`);
          }
        } catch (error) {
          report.fail(`${label}: ${error.message}`);
        }
      }
    }
  }
}

async function playEncounters(session) {
  report.section('Play: every keyed encounter');
  const adventure = session.adventure;
  for (const dungeon of adventure.dungeons) {
    for (const level of dungeon.levels) {
      for (const area of level.areas.filter((a) => a.encounter)) {
        const label = `${dungeon.id} level ${level.number}: ${area.id}`;
        try {
          let started = false;
          for (let attempt = 0; attempt < 3 && !started; attempt += 1) {
            await enterArea(session, dungeon.id, level, area);
            if (session.mode === 'encounter' || session.mode === 'battle') {
              const referee = await session.referee();
              started = referee.encounter?.area_ref?.endsWith(`:${area.id}`) ?? false;
            }
            await session.calm();
          }
          const monsters = area.encounter.monsters
            .map((m) => `${m.count_fixed ?? m.count_dice} ${m.template_id}`)
            .join(', ');
          if (started) report.pass(`${label} starts its encounter (${monsters})`);
          else report.fail(`${label}: walking in started no encounter (${monsters})`);
        } catch (error) {
          report.fail(`${label}: ${error.message}`);
        }
      }
    }
  }
}

async function playTriggers(adventure, open) {
  report.section('Play: every trigger');
  for (const trigger of adventure.triggers) {
    const session = await open();
    try {
      await satisfy(session, trigger.when, trigger.conditions);
      await session.calm();
      const referee = await session.referee();
      if (!referee.fired_triggers.includes(trigger.id)) {
        report.fail(`${trigger.id}: the trigger did not fire`);
        continue;
      }
      const did = trigger.consequences.map((c) => c.command_type).join(', ') || 'journal only';
      report.pass(`${trigger.id}: fires (${did})`);
      for (const note of session.notes) report.note(`${trigger.id}: ${note}`);
    } catch (error) {
      report.fail(`${trigger.id}: ${error.message}`);
    }
  }
}

async function playQuest(session, quest) {
  const state = async () => (await session.referee()).quests[quest.id];
  await satisfy(session, { pattern_type: 'dungeon_entered', dungeon_id: session.adventure.dungeons[0].id });
  if (quest.activation) await satisfy(session, quest.activation.pattern, quest.activation.conditions);
  if ((await state()).status !== 'active') throw new Error(`the quest did not activate`);
  for (const objective of quest.objectives) {
    if (objective.hidden && objective.reveal_when) {
      await satisfy(session, objective.reveal_when.pattern, objective.reveal_when.conditions);
      const revealed = (await state()).objectives[objective.id];
      if (!revealed?.revealed) throw new Error(`hidden objective ${objective.id} was not revealed`);
    }
    await satisfy(session, objective.when.pattern, objective.when.conditions);
    const after = (await state()).objectives[objective.id];
    if (!after?.complete) {
      throw new Error(`objective ${objective.id} did not complete (${JSON.stringify(after)})`);
    }
    if ((await state()).status === 'completed') break;
  }
  const final = await state();
  if (final.status !== 'completed') throw new Error(`the quest ended ${final.status}`);
  if (quest.concludes_adventure && session.mode !== 'victory') {
    throw new Error(`the adventure did not end in victory (mode ${session.mode})`);
  }
}

// ---------------------------------------------------------------------------------------------
// Main.

const created = { sessions: [], adventures: [] };

async function checkFile(path) {
  console.log(`\n#### ${basename(path)}`);
  const document = JSON.parse(readFileSync(path, 'utf8'));
  const adventure = document.payload;

  report.section('Validation');
  const validation = await mustRequest('POST', '/v1/adventures/validate', document, 200);
  if (!validation.valid) {
    report.fail(`bxapi refused the document: ${validation.code}: ${validation.detail}`);
    return;
  }
  report.pass(`bxapi accepts "${adventure.name}"`);

  if (showMaps) {
    for (const dungeon of adventure.dungeons) {
      for (const level of dungeon.levels) {
        console.log('\n' + renderLevel(level, { title: `${dungeon.id} level ${level.number}` }));
      }
    }
  }

  staticChecks(adventure);

  const uploaded = await mustRequest('POST', '/v1/adventures', document, 201);
  created.adventures.push(uploaded.id);
  const party = await generateParty();
  const open = async () => {
    const session = await newSession(uploaded.id, adventure, party);
    created.sessions.push(session.id);
    await session.must({ command_type: 'enter_dungeon', dungeon_id: adventure.dungeons[0].id });
    return session;
  };

  await playTransitions(await open());
  await playEncounters(await open());
  await playTriggers(adventure, open);

  report.section('Play: every quest');
  for (const quest of adventure.quests) {
    try {
      const session = await open();
      await playQuest(session, quest);
      for (const note of session.notes) report.note(`${quest.id}: ${note}`);
      report.pass(
        `${quest.id}: all ${quest.objectives.length} objectives complete${quest.concludes_adventure ? ', and the adventure ends in victory' : ''}`,
      );
    } catch (error) {
      report.fail(`${quest.id}: ${error.message}`);
    }
  }
}

try {
  const meta = await mustRequest('GET', '/v1/meta', undefined, 200);
  console.log(
    `bxapi at ${baseUrl}: engine ${meta.engine_version}, schema ${meta.schema_version}, role ${meta.role}`,
  );
  if (meta.role !== 'referee') throw new Error('the checks need a referee key or an anonymous server');
  for (const path of targets) {
    try {
      await checkFile(path);
    } catch (error) {
      report.fail(`${basename(path)}: ${error.message}`);
    }
  }
} finally {
  for (const id of created.sessions) await request('DELETE', `/v1/sessions/${id}`);
  for (const id of created.adventures) await request('DELETE', `/v1/adventures/${id}`);
  console.log(
    `\nDeleted ${created.sessions.length} sessions and ${created.adventures.length} uploaded adventures.`,
  );
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nEvery check passed.');
process.exitCode = failures ? 1 : 0;
