// Helpers for writing osrlib adventure documents from map masks, and for drawing levels as text.
//
// A level is written as a mask: one character per 10-foot cell, `#` or a space for solid rock.
// Cells with the same character join with open edges. Cells with different characters are walled
// apart unless the level opens the edge or puts a door on it. Area symbols are declared with
// `LevelBuilder.area`. Every other carved character is corridor.

export const SCHEMA_VERSION = 4;
export const ENGINE_VERSION = '2.5.0';

export const DIRECTIONS = ['north', 'east', 'south', 'west'];
const VECTORS = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const OPPOSITE = { north: 'south', east: 'west', south: 'north', west: 'east' };

export function step([x, y], direction) {
  const [dx, dy] = VECTORS[direction];
  return [x + dx, y + dy];
}

export function opposite(direction) {
  return OPPOSITE[direction];
}

// The key osrlib uses for an edge: the cell and its north or west side.
export function edgeKey([x, y], direction) {
  if (direction === 'south') return `${x},${y + 1}:north`;
  if (direction === 'east') return `${x + 1},${y}:west`;
  return `${x},${y}:${direction}`;
}

const key = ([x, y]) => `${x},${y}`;

export function coins(values = {}) {
  return { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0, ...values };
}

export function narrative(beats = {}) {
  return {
    refusal: '',
    success: '',
    fired: '',
    offer: '',
    progress: '',
    completion: '',
    journal: '',
    guidance: '',
    speaker: '',
    ...beats,
  };
}

export function door(spec = {}) {
  return { kind: 'normal', stuck: false, locked: false, starts_open: false, requires: null, ...spec };
}

export function gate(condition, beats = {}) {
  return { condition, narrative: narrative(beats) };
}

export const hasItem = (item_id, consumes = false) => ({ condition_type: 'has_item', item_id, consumes });
export const flagEquals = (k, value) => ({ condition_type: 'flag_equals', key: k, value });

export function trapEffect(spec = {}) {
  return {
    damage_dice: null,
    volley_dice: null,
    save: null,
    kills: false,
    condition: null,
    condition_duration_dice: null,
    condition_duration_amount: null,
    condition_duration_unit: null,
    fall_feet: null,
    transition: null,
    manual: null,
    ...spec,
  };
}

export function trap({ kind, trigger, affects = 'triggerer', ...effect }) {
  return { kind, trigger, effect: trapEffect(effect), affects };
}

export const save = (category, on_save = 'negates', modifier = 0) => ({ category, modifier, on_save });

export function monsters(lines, options = {}) {
  return {
    monsters: lines.map(([template_id, count]) =>
      typeof count === 'number'
        ? { template_id, count_dice: null, count_fixed: count }
        : { template_id, count_dice: count, count_fixed: null },
    ),
    alignment: null,
    aware: false,
    stance: null,
    hoard: false,
    ...options,
  };
}

export function feature(spec) {
  return {
    id: spec.id,
    kind: spec.kind,
    description: spec.description ?? '',
    referee_notes: spec.referee_notes ?? '',
    cell: spec.cell ?? null,
    item_ids: spec.item_ids ?? [],
    magic_item_ids: spec.magic_item_ids ?? [],
    coins: coins(spec.coins),
    valuables: spec.valuables ?? [],
    trap: spec.trap ?? null,
  };
}

// `phrase` is what the player view calls the piece in the middle of a sentence. Leave it out when the default reads
// right: osrlib lowers the first letter of `name` and puts `a` or `an` in front. Set it for a proper name
// ("Ossor's Eye"), for a name that takes `the` (a possessive, such as "the abbot's gold ring"), and for a plural.
export const valuable = (kind, name, value_gp, weight_coins = 0, phrase = undefined) => ({
  kind,
  name,
  value_gp,
  weight_coins,
  ...(phrase === undefined ? {} : { phrase }),
});

export function transition(spec) {
  return { side: null, requires: null, ...spec };
}

// A wandering table: `rows` lists [first roll, last roll, name, monster ids or 'npc:basic', count].
export function wanderingTable(id, label, level, rows) {
  const out = [];
  for (const [from, to, name, what, count] of rows) {
    for (let roll = from; roll <= to; roll += 1) {
      const entry =
        typeof what === 'string' && what.startsWith('npc:')
          ? { kind: 'npc_party', party_kind: what.slice(4) }
          : { kind: 'monster', monster_ids: Array.isArray(what) ? what : [what], variant_dice: null };
      out.push({
        roll,
        name,
        entry,
        count_dice: typeof count === 'number' ? null : count,
        count_fixed: typeof count === 'number' ? count : null,
      });
    }
  }
  if (out.length !== 20 || out.some((row, index) => row.roll !== index + 1)) {
    throw new Error(`wandering table ${id} must cover 1-20 in order`);
  }
  return { id, label, min_level: level, max_level: level, rows: out, overrides_applied: [] };
}

export function envelope(payload) {
  return { kind: 'adventure', schema_version: SCHEMA_VERSION, engine_version: ENGINE_VERSION, payload };
}

export class LevelBuilder {
  constructor({ dungeonId, number, mask }) {
    this.dungeonId = dungeonId;
    this.number = number;
    const lines = mask
      .replace(/^\n/, '')
      .replace(/\n\s*$/, '')
      .split('\n');
    this.height = lines.length;
    this.width = Math.max(...lines.map((line) => line.length));
    this.symbols = new Map();
    lines.forEach((line, y) => {
      [...line].forEach((symbol, x) => {
        if (symbol !== '#' && symbol !== ' ') this.symbols.set(key([x, y]), symbol);
      });
    });
    this.areaSymbols = new Map();
    this.areas = [];
    this.explicit = new Map();
    this.features = [];
    this.transitions = [];
  }

  carved(cell) {
    return this.symbols.has(key(cell));
  }

  symbolAt(cell) {
    return this.symbols.get(key(cell));
  }

  cellsOf(symbol) {
    const cells = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.symbols.get(key([x, y])) === symbol) cells.push([x, y]);
      }
    }
    if (cells.length === 0) throw new Error(`level ${this.number}: no cells carry symbol ${symbol}`);
    return cells;
  }

  area(symbol, spec) {
    if (this.areaSymbols.has(symbol)) throw new Error(`level ${this.number}: symbol ${symbol} used twice`);
    this.areaSymbols.set(symbol, spec.id);
    this.areas.push({
      id: spec.id,
      name: spec.name ?? '',
      description: spec.description ?? '',
      cells: this.cellsOf(symbol),
      encounter: spec.encounter ?? null,
      features: (spec.features ?? []).map(feature),
      trap: spec.trap ?? null,
      treasure: spec.treasure ?? null,
    });
    return this;
  }

  #setEdge(cell, direction, edge) {
    const other = step(cell, direction);
    if (!this.carved(cell) || !this.carved(other)) {
      throw new Error(`level ${this.number}: edge ${key(cell)} ${direction} does not join two carved cells`);
    }
    this.explicit.set(edgeKey(cell, direction), edge);
  }

  open(cell, direction) {
    this.#setEdge(cell, direction, { kind: 'open', door: null });
    return this;
  }

  wall(cell, direction) {
    this.explicit.set(edgeKey(cell, direction), { kind: 'wall', door: null });
    return this;
  }

  door(cell, direction, spec = {}) {
    this.#setEdge(cell, direction, { kind: 'door', door: door(spec) });
    return this;
  }

  // Open every edge between cells of symbol `a` and cells of symbol `b`.
  join(a, b) {
    for (const cell of this.cellsOf(a)) {
      for (const direction of DIRECTIONS) {
        if (this.symbolAt(step(cell, direction)) === b) this.open(cell, direction);
      }
    }
    return this;
  }

  feature(spec) {
    this.features.push(feature(spec));
    return this;
  }

  transition(spec) {
    this.transitions.push(transition(spec));
    return this;
  }

  build({ entrance = null, wandering, guidance = '' }) {
    const edges = {};
    for (const [cellKey, symbol] of this.symbols) {
      const cell = cellKey.split(',').map(Number);
      for (const direction of ['east', 'south']) {
        const other = step(cell, direction);
        if (this.symbolAt(other) === symbol) edges[edgeKey(cell, direction)] = { kind: 'open', door: null };
      }
    }
    for (const [edge, value] of this.explicit) {
      if (value.kind === 'wall') delete edges[edge];
      else edges[edge] = value;
    }
    const sorted = Object.fromEntries(
      Object.entries(edges).sort(([a], [b]) => {
        const [ax, ay] = a.split(':')[0].split(',').map(Number);
        const [bx, by] = b.split(':')[0].split(',').map(Number);
        return ay - by || ax - bx || a.localeCompare(b);
      }),
    );
    return {
      number: this.number,
      width: this.width,
      height: this.height,
      edges: sorted,
      areas: this.areas,
      features: this.features,
      transitions: this.transitions,
      wandering,
      entrance,
      guidance,
    };
  }
}

// Return the edge spec on one side of a cell of a level spec: a wall when the map has no entry.
export function edgeOf(level, cell, direction) {
  const other = step(cell, direction);
  const inBounds = ([x, y]) => x >= 0 && y >= 0 && x < level.width && y < level.height;
  if (!inBounds(cell) || !inBounds(other)) return { kind: 'wall', door: null };
  return level.edges[edgeKey(cell, direction)] ?? { kind: 'wall', door: null };
}

// Draw a level spec as text. Each cell is two characters wide. The legend lists the glyphs.
export function renderLevel(level, { title = '' } = {}) {
  const areaAt = new Map();
  level.areas.forEach((area, index) => {
    for (const cell of area.cells) if (!areaAt.has(key(cell))) areaAt.set(key(cell), index);
  });
  const carved = new Set(areaAt.keys());
  for (const edge of Object.keys(level.edges)) {
    const [cellPart, side] = edge.split(':');
    const cell = cellPart.split(',').map(Number);
    carved.add(key(cell));
    carved.add(key(step(cell, side)));
  }
  const marks = new Map();
  const glyph = { stairs_up: 'up', stairs_down: 'dn', trapdoor: 'td', chute: 'ch' };
  for (const transition of level.transitions) {
    if (transition.kind !== 'passage') marks.set(key(transition.position), glyph[transition.kind]);
  }
  for (const area of level.areas) {
    if (area.trap?.effect?.transition) marks.set(key(area.trap.effect.transition.position), 'ch');
  }
  if (level.entrance) marks.set(key(level.entrance), 'EN');
  // Each area's number goes on its first cell that has no other mark.
  const labels = new Map();
  level.areas.forEach((area, index) => {
    const cell = area.cells.find((c) => !marks.has(key(c))) ?? area.cells[0];
    labels.set(key(cell), String(index + 1).padStart(2, '0'));
  });
  const passages = new Set(
    level.transitions.filter((t) => t.kind === 'passage').map((t) => edgeKey(t.position, t.side)),
  );
  const doorGlyph = (edge, horizontal) => {
    const spec = edge.door;
    let ch = 'D';
    if (spec.kind === 'secret') ch = 'S';
    else if (spec.requires) ch = 'G';
    else if (spec.locked) ch = 'L';
    else if (spec.stuck) ch = 'K';
    else if (spec.starts_open) ch = 'O';
    return horizontal ? ch + ch : ch;
  };
  const isCarved = (cell) => carved.has(key(cell));
  const lines = [];
  if (title) lines.push(title);
  let header = '   ';
  for (let x = 0; x < level.width; x += 1) header += String(x % 100).padStart(3, ' ');
  lines.push(header);
  for (let y = 0; y <= level.height; y += 1) {
    // The horizontal edges on the north side of row y.
    // A corner is drawn as rock unless a carved cell touches it.
    let wallLine = '   ';
    for (let x = 0; x < level.width; x += 1) {
      const above = [x, y - 1];
      const below = [x, y];
      const either = isCarved(above) || isCarved(below);
      wallLine += either || isCarved([x - 1, y - 1]) || isCarved([x - 1, y]) ? '+' : '#';
      if (y === level.height || y === 0) {
        wallLine += either ? '--' : '##';
        continue;
      }
      const edge = level.edges[`${x},${y}:north`];
      if (passages.has(`${x},${y}:north`)) wallLine += 'PP';
      else if (!edge) wallLine += either ? '--' : '##';
      else if (edge.kind === 'open') wallLine += '  ';
      else if (edge.kind === 'door') wallLine += doorGlyph(edge, true);
      else wallLine += '--';
    }
    wallLine += isCarved([level.width - 1, y - 1]) || isCarved([level.width - 1, y]) ? '+' : '#';
    lines.push(wallLine);
    if (y === level.height) break;
    let cellLine = String(y).padStart(2, ' ') + ' ';
    for (let x = 0; x <= level.width; x += 1) {
      const left = [x - 1, y];
      const here = [x, y];
      const either = isCarved(left) || isCarved(here);
      const edge = level.edges[`${x},${y}:west`];
      if (passages.has(`${x},${y}:west`)) cellLine += 'P';
      else if (x === 0 || x === level.width || !edge) cellLine += either ? '|' : '#';
      else if (edge.kind === 'open') cellLine += ' ';
      else if (edge.kind === 'door') cellLine += doorGlyph(edge, false);
      else cellLine += '|';
      if (x === level.width) break;
      if (marks.has(key(here))) cellLine += marks.get(key(here));
      else if (labels.has(key(here))) cellLine += labels.get(key(here));
      else if (areaAt.has(key(here))) cellLine += '..';
      else if (isCarved(here)) cellLine += '  ';
      else cellLine += '##';
    }
    lines.push(cellLine);
  }
  lines.push('');
  level.areas.forEach((area, index) => {
    lines.push(`${String(index + 1).padStart(2, '0')} ${area.id}: ${area.name}`);
  });
  lines.push(
    'Glyphs: EN entrance, up/dn stairs, td trapdoor, ch chute, P passage, D door, K stuck, L locked, G gated, S secret, O starts open, .. area, ## rock.',
  );
  return lines.join('\n');
}
