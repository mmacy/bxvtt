/**
 * In-memory search over every catalog. `buildSearchItems` indexes the loaded catalogs once, and `search` ranks
 * them for a query in well under a millisecond per thousand entries.
 */
import type {
  ClassSummary,
  CommandSummary,
  EquipmentSummary,
  Language,
  MagicItemSummary,
  MonsterSummary,
  SpellSummary,
} from '@bxvtt/shared/bxapi';
import type { FullCatalogEntries } from '@bxvtt/shared/protocol';
import {
  abilityLabel,
  alignmentLabel,
  classLabel,
  commandInfo,
  formatDice,
  itemTypeLabel,
  ordinal,
  weaponQualityLabel,
} from '@bxvtt/shared/text';
import { SECTIONS, TABLE_ANCHORS, tableSetInfo, type Route, type SectionId } from './model';
import {
  formatArmourClass,
  formatCost,
  formatHitDice,
  magicCategoryLabel,
  normalize,
  stripMarkup,
} from './typeset';

export type ResultKind = SectionId | 'license';

export interface SearchItem {
  kind: ResultKind;
  id: string;
  name: string;
  /** The line under the name: "Magic-User spell, level 1". */
  subtitle: string;
  route: Route;
  nameNorm: string;
  words: string[];
  tags: string[];
  /** The words of the entry's text, which match a search only when no name or facet does. */
  bodyWords: string[];
  /** The entry's text as written, for a snippet under a result. */
  bodyText: string;
  /** The spell level, for the facet `level 3`. */
  level?: number;
  /** The monster's hit dice count, for the facet `hd 3`. */
  hd?: number;
}

export interface Catalogs {
  classes?: readonly ClassSummary[] | null;
  spells?: readonly SpellSummary[] | null;
  monsters?: readonly MonsterSummary[] | null;
  equipment?: readonly EquipmentSummary[] | null;
  magicItems?: readonly MagicItemSummary[] | null;
  languages?: readonly Language[] | null;
  commands?: readonly CommandSummary[] | null;
  /** The full entries, once they have loaded, so search can read their text and facets. */
  fullClasses?: readonly FullCatalogEntries['classes'][] | null;
  fullSpells?: readonly FullCatalogEntries['spells'][] | null;
  fullMonsters?: readonly FullCatalogEntries['monsters'][] | null;
  fullEquipment?: readonly FullCatalogEntries['equipment'][] | null;
}

/** The name of a spell list for display, which is the name of its class: `Magic-User`. */
export function spellListLabel(list: string): string {
  return classLabel(list);
}

function words(text: string): string[] {
  const norm = normalize(text);
  return norm === '' ? [] : norm.split(' ');
}

function item(
  partial: Omit<SearchItem, 'nameNorm' | 'words' | 'tags' | 'bodyWords' | 'bodyText'> & {
    tags?: string;
    body?: string;
  },
): SearchItem {
  const { tags = '', body = '', ...rest } = partial;
  return {
    ...rest,
    nameNorm: normalize(rest.name),
    words: words(rest.name),
    tags: words(tags),
    bodyWords: [...new Set(words(body))],
    bodyText: body,
  };
}

const lines = (...parts: (string | undefined | null)[]) =>
  parts.filter((part): part is string => !!part).join(' ');

/** The commands a player sends, which the Actions section lists. Referee commands are not a player's to read about. */
export function isPlayCommand(command: CommandSummary): boolean {
  // Nobody sends this one: the battle board resolves a round once the table has declared.
  return command.kind === 'play' && command.command_type !== 'resolve_battle_round';
}

function byId<T extends { id: string }>(entries: readonly T[] | null | undefined): Map<string, T> {
  return new Map((entries ?? []).map((entry) => [entry.id, entry]));
}

/** Indexes the loaded catalogs. A catalog that hasn't loaded contributes nothing. */
export function buildSearchItems(catalogs: Catalogs): SearchItem[] {
  const items: SearchItem[] = [];
  const fullClasses = byId(catalogs.fullClasses);
  const fullSpells = byId(catalogs.fullSpells);
  const fullMonsters = byId(catalogs.fullMonsters);
  const fullEquipment = byId(catalogs.fullEquipment);
  for (const c of catalogs.classes ?? []) {
    const full = fullClasses.get(c.id);
    items.push(
      item({
        kind: 'classes',
        id: c.id,
        name: c.name,
        subtitle: `Hit die d${c.hit_die}, maximum level ${c.max_level}`,
        route: { page: 'entry', kind: 'classes', id: c.id },
        tags: `class ${c.race} ${c.prime_requisites.map((a) => abilityLabel(a)).join(' ')}`,
        body: lines(...(full?.abilities ?? []).map((a) => `${stripMarkup(a.name)}. ${stripMarkup(a.prose)}`)),
      }),
    );
  }
  for (const s of catalogs.spells ?? []) {
    const full = fullSpells.get(s.id);
    items.push(
      item({
        kind: 'spells',
        id: s.id,
        name: s.name,
        subtitle: `${spellListLabel(s.spell_list)} spell, level ${s.level}`,
        route: { page: 'entry', kind: 'spells', id: s.id },
        tags: `spell ${spellListLabel(s.spell_list)} ${s.range} ${s.duration} ${full?.reversed_form ? 'reversible reverse ' + full.reversed_form.name : ''}`,
        body: full
          ? lines(
              stripMarkup(full.intro),
              ...full.modes.map((mode) => stripMarkup(mode.prose)),
              full.reversed_form ? stripMarkup(full.reversed_form.prose) : null,
            )
          : '',
        level: s.level,
      }),
    );
  }
  for (const m of catalogs.monsters ?? []) {
    const full = fullMonsters.get(m.id);
    const categories = full?.categories ?? [];
    items.push(
      item({
        kind: 'monsters',
        id: m.id,
        name: m.name,
        subtitle: `Hit dice ${formatHitDice(m.hit_dice)}, armour class ${formatArmourClass(m.ac, m.ac_ascending)}`,
        route: { page: 'entry', kind: 'monsters', id: m.id },
        tags: `monster ${m.alignment.options.map(alignmentLabel).join(' ')} ${categories.join(' ')}`,
        body: full
          ? lines(
              stripMarkup(full.intro),
              ...full.abilities.map((a) => `${stripMarkup(a.name)}. ${stripMarkup(a.prose)}`),
            )
          : '',
        hd: m.hit_dice.count,
      }),
    );
  }
  for (const e of catalogs.equipment ?? []) {
    const type = itemTypeLabel(e.item_type);
    const full = fullEquipment.get(e.id);
    const qualities =
      full?.item_type === 'weapon'
        ? full.qualities
        : full?.item_type === 'gear' && full.combat
          ? full.combat.qualities
          : [];
    const damage =
      full?.item_type === 'weapon' ? full.damage : full?.item_type === 'gear' ? full.combat?.damage : null;
    items.push(
      item({
        kind: 'equipment',
        id: e.id,
        name: e.name,
        subtitle: lines(`${type}, ${formatCost(e.cost_gp)}`, damage ? `, ${formatDice(damage)} damage` : ''),
        route: { page: 'entry', kind: 'equipment', id: e.id },
        tags: `${type} ${e.item_type === 'armour' ? 'armor' : ''} ${qualities.map(weaponQualityLabel).join(' ')} ${damage ?? ''}`,
      }),
    );
  }
  for (const m of catalogs.magicItems ?? []) {
    items.push(
      item({
        kind: 'magic-items',
        id: m.id,
        name: m.name,
        subtitle: `Magic item, ${magicCategoryLabel(m.category).toLowerCase()}`,
        route: { page: 'entry', kind: 'magic-items', id: m.id },
        tags: `magic ${magicCategoryLabel(m.category)} ${magicCategoryLabel(m.category, true)}`,
      }),
    );
  }
  for (const l of catalogs.languages ?? []) {
    items.push(
      item({
        kind: 'languages',
        id: l.id,
        name: l.name,
        subtitle: 'Language',
        route: { page: 'entry', kind: 'languages', id: l.id },
        tags: 'language tongue',
      }),
    );
  }
  for (const anchor of TABLE_ANCHORS) {
    const set = tableSetInfo(anchor.set);
    items.push(
      item({
        kind: 'tables',
        id: `${anchor.set}/${anchor.anchor}`,
        name: anchor.title,
        subtitle: `${set.label} table`,
        route: { page: 'entry', kind: 'tables', id: anchor.set, anchor: anchor.anchor },
        tags: `table ${set.label} ${anchor.keywords}`,
      }),
    );
  }
  for (const command of (catalogs.commands ?? []).filter(isPlayCommand)) {
    const info = commandInfo(command.command_type);
    items.push(
      item({
        kind: 'commands',
        id: command.command_type,
        name: info.label,
        subtitle: 'Action',
        route: { page: 'entry', kind: 'commands', id: command.command_type },
        tags: 'action command',
        body: info.description,
      }),
    );
  }
  items.push(
    item({
      kind: 'license',
      id: 'license',
      name: 'Open Game License',
      subtitle: 'Terms of the rules content',
      route: { page: 'license' },
      tags: 'ogl legal copyright open game content',
    }),
  );
  return items;
}

export type QueryToken =
  | { type: 'word'; value: string }
  | { type: 'level'; value: number }
  | { type: 'hd'; value: number }
  | { type: 'number'; value: number };

const ORDINAL = /^(\d+)(?:st|nd|rd|th)$/;

/**
 * Splits a query into words and facets. `level 3`, `3rd level`, `lvl3`, and `l3` mean spell level. `hd 4`
 * and `4hd` mean hit dice. A bare number matches either.
 */
export function parseQuery(query: string): QueryToken[] {
  const parts = words(query);
  const tokens: QueryToken[] = [];
  const num = (value: string | undefined): number | null => {
    if (value === undefined) return null;
    const match = ORDINAL.exec(value);
    const digits = match ? match[1] : value;
    return digits !== undefined && /^\d+$/.test(digits) ? Number(digits) : null;
  };
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    const next = parts[i + 1];
    let m: RegExpExecArray | null;
    if ((part === 'level' || part === 'lvl' || part === 'spell') && num(next) !== null) {
      tokens.push({ type: 'level', value: num(next) ?? 0 });
      i++;
    } else if (num(part) !== null && (next === 'level' || next === 'lvl')) {
      tokens.push({ type: 'level', value: num(part) ?? 0 });
      i++;
    } else if (part === 'hd' && num(next) !== null) {
      tokens.push({ type: 'hd', value: num(next) ?? 0 });
      i++;
    } else if (num(part) !== null && next === 'hd') {
      tokens.push({ type: 'hd', value: num(part) ?? 0 });
      i++;
    } else if ((m = /^(?:l|lvl|level)(\d+)$/.exec(part))) {
      tokens.push({ type: 'level', value: Number(m[1]) });
    } else if ((m = /^(?:hd(\d+)|(\d+)hd)$/.exec(part))) {
      tokens.push({ type: 'hd', value: Number(m[1] ?? m[2]) });
    } else if (num(part) !== null) {
      tokens.push({ type: 'number', value: num(part) ?? 0 });
    } else {
      tokens.push({ type: 'word', value: part });
    }
  }
  return tokens;
}

/** Scores one word against an item: exact name word 4, name word prefix 3, tag prefix 2, name substring 1. */
function wordScore(entry: SearchItem, word: string): number {
  let best = 0;
  for (const w of entry.words) {
    if (w === word) return 4;
    if (w.startsWith(word)) best = Math.max(best, 3);
  }
  if (best > 0) return best;
  for (const t of entry.tags) if (t.startsWith(word)) return 2;
  if (word.length >= 3 && entry.nameNorm.replace(/ /g, '').includes(word)) return 1;
  if (word.length >= 3) for (const b of entry.bodyWords) if (b.startsWith(word)) return 0.5;
  return 0;
}

/**
 * When a result matches only through the entry's text, the sentence part that holds the first such word, so the
 * list can show why the entry matched. Returns `null` when the name or a facet matches.
 */
export function bodySnippet(entry: SearchItem, query: string): string | null {
  const needles = parseQuery(query).flatMap((t) => (t.type === 'word' ? [t.value] : []));
  const text = entry.bodyText;
  for (const needle of needles) {
    if (wordScore({ ...entry, bodyWords: [] }, needle) > 0) continue;
    const at = text.toLowerCase().indexOf(needle);
    if (at === -1) continue;
    const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 28)));
    const end = Math.min(text.length, at + needle.length + 56);
    const cut = text.indexOf(' ', end);
    const stop = cut === -1 || cut > end + 12 ? end : cut;
    return `${start > 0 ? '…' : ''}${text.slice(start, stop).trim()}${stop < text.length ? '…' : ''}`;
  }
  return null;
}

/** How well an item matches the tokens, or 0 when any token fails to match. */
export function scoreItem(entry: SearchItem, tokens: readonly QueryToken[], queryNorm: string): number {
  let score = 0;
  for (const token of tokens) {
    let s = 0;
    switch (token.type) {
      case 'word':
        s = wordScore(entry, token.value);
        break;
      case 'level':
        s = entry.level === token.value ? 3 : 0;
        break;
      case 'hd':
        s = entry.hd === token.value ? 3 : 0;
        break;
      case 'number':
        s =
          entry.level === token.value || entry.hd === token.value
            ? 2
            : entry.words.includes(String(token.value))
              ? 3
              : 0;
        break;
    }
    if (s === 0) return 0;
    score += s;
  }
  if (entry.nameNorm === queryNorm) score += 100;
  else if (entry.nameNorm.startsWith(queryNorm)) score += 40;
  else if (entry.words.some((w) => w.startsWith(queryNorm))) score += 15;
  return score;
}

export interface SearchGroup {
  kind: ResultKind;
  items: SearchItem[];
  /** The best score of any item, for ordering the groups. */
  best: number;
}

const KIND_ORDER: ResultKind[] = [...SECTIONS.map((s) => s.id), 'license'];

/**
 * Searches the index. Returns the groups in order of their best match, each group's items best first,
 * or an empty list for a blank query.
 */
export function search(items: readonly SearchItem[], query: string, limit = 400): SearchGroup[] {
  const queryNorm = normalize(query);
  if (queryNorm === '') return [];
  const tokens = parseQuery(query);
  const scored: { entry: SearchItem; score: number }[] = [];
  for (const entry of items) {
    const score = scoreItem(entry, tokens, queryNorm);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.nameNorm.localeCompare(b.entry.nameNorm));
  const groups = new Map<ResultKind, SearchGroup>();
  for (const { entry, score } of scored.slice(0, limit)) {
    const group = groups.get(entry.kind) ?? { kind: entry.kind, items: [], best: score };
    group.items.push(entry);
    groups.set(entry.kind, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.best - a.best || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );
}

export interface Segment {
  text: string;
  match: boolean;
}

/** Splits a display string so that the parts that match the query's words can be highlighted. */
export function highlight(text: string, query: string): Segment[] {
  const needles = parseQuery(query).flatMap((t) =>
    t.type === 'word' ? [t.value] : t.type === 'number' ? [String(t.value)] : [],
  );
  if (needles.length === 0) return [{ text, match: false }];
  // Map each normalized character back to its place in the original text.
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const folded = (text[i] ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const ch of folded) {
      if (/[’'`]/.test(ch)) continue;
      norm += /[a-z0-9]/.test(ch) ? ch : ' ';
      map.push(i);
    }
  }
  const marked = new Array<boolean>(text.length).fill(false);
  for (const needle of needles) {
    let at = -1;
    for (let i = norm.indexOf(needle); i !== -1; i = norm.indexOf(needle, i + 1)) {
      if (i === 0 || norm[i - 1] === ' ') {
        at = i;
        break;
      }
      if (at === -1) at = i;
    }
    if (at === -1) continue;
    for (let k = at; k < at + needle.length; k++) {
      const origin = map[k];
      if (origin !== undefined) marked[origin] = true;
    }
  }
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const match = marked[i] === true;
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += text[i];
    else segments.push({ text: text[i] ?? '', match });
  }
  return segments;
}

/** Whether every word of a filter appears at the start of a word in the name, or inside it. */
export function matchesFilter(name: string, filter: string): boolean {
  const needles = words(filter);
  if (needles.length === 0) return true;
  const haystack = normalize(name);
  const nameWords = haystack.split(' ');
  return needles.every((n) => nameWords.some((w) => w.startsWith(n)) || haystack.includes(n));
}

/** Names the facet in a class or spell level for a heading: `1st level`. */
export function levelHeading(level: number): string {
  return `${ordinal(level)} level`;
}
