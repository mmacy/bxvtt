/**
 * Replace the IDs in a bxapi message with names.
 *
 * bxapi's English `messages` use raw IDs: `character-0001 closes to 5' from group-0001.` `humanizeMessage`
 * turns that into `Brenna closes to 5' from the goblins.` It is the fallback for events that
 * [`describeEvent`][describeEvent] has no template for, and it is safe to run on any message.
 */

import { equipmentNoun, magicItemTemplateName, monsterTemplateLabels, spellCatalogName } from './catalog';
import {
  areaName,
  countedLabel,
  dungeonName,
  ENTITY_ID_PATTERN,
  entityName,
  isProperLabel,
  itemNoun,
  type TextContext,
} from './context';
import {
  capitalizeFirst,
  count,
  joinList,
  placeInSentence,
  prettifyId,
  singularize,
  withArticle,
} from './format';

const SNAKE_OR_KEBAB_TOKEN = /\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+\b/g;
const MONSTER_WITH_TEMPLATE = /\b(monster-\d{4,}) \(([a-z0-9_:]+)\)/g;
const EFFECT_WITH_KIND = /\bEffect effect-\d{4,} \(([a-z0-9_]+)\)/g;
const TRAP_REF = /\b([a-z][a-z0-9_-]*):(\d+):([a-z][a-z0-9_-]*)\b/g;
const DUNGEON_OR_AREA = /\b(dungeon|area) ([a-z][a-z0-9_-]*)\b/g;
const ENTERS_TOWN = /\bThe party enters town [a-z0-9_-]+(?: \(level \d+\))?\./g;
const ENTERS_LEVEL = /\bThe party enters level ([a-z][a-z0-9_-]*) \(level (\d+)\)\./g;
const MOVES_TO_CELL = /\bThe party moves to \(-?\d+, -?\d+\), facing ([a-z]+)\./g;
const DOOR_OF_CELL = /\b([Tt])he door ([a-z]+) of \(-?\d+, -?\d+\)/g;
const NOTHING_LISTED = /\b(acquires|drops|gives) (?=\.| to )/g;
const ENTERS_PLACE = /\bThe party enters (dungeon|area) ([a-z][a-z0-9_-]*) \(level (\d+)\)\./g;
const ENCOUNTER = /\bEncounter: (\d+ .+?) at (\d+)'/g;

/**
 * Hyphenated English words in osrlib's lines, which read as written rather than as the words of an ID such as
 * `jade-idol`.
 */
const HYPHENATED_WORDS = new Set([
  'back-stab',
  'back-stabs',
  'one-level',
  'in-6',
  'trap-spring',
  'referee-only',
]);

/**
 * Who the party meets, for osrlib's `Encounter: 2 goblins and 1 Mag Corrie at 60'`. A line that names several
 * groups reads each one, and a proper name such as `Mag Corrie` takes no count. A line that names one group may
 * come from before osrlib 2.7, which named the first group and counted every monster, so the groups the context
 * knows replace it when their sizes add up.
 */
function encounterList(list: string, ctx: TextContext): string {
  const parts = list.split(/, and |, | and /).map((part) => /^(\d+) (.+)$/.exec(part));
  if (parts.some((part) => part === null)) return list;
  const groups = parts.flatMap((part) =>
    part?.[1] && part[2] ? [{ n: Number(part[1]), label: part[2] }] : [],
  );
  const first = groups[0];
  if (groups.length === 1 && first) return encounterCompany(first.n, first.label, ctx);
  return joinList(
    groups.map(({ n, label }) =>
      n === 1 ? (isProperLabel(label) ? label : withArticle(label)) : count(n, label, label),
    ),
  );
}

/**
 * Who the party meets, for a line that names one group: `3 goblins`. When the groups the context knows add up to
 * the count, they replace it, and a proper name such as `Mag Corrie` never takes a plural.
 */
function encounterCompany(total: number, named: string, ctx: TextContext): string {
  const groups = Object.values(ctx.groups).filter((group) => group.count !== undefined && group.count > 0);
  if (groups.length > 0 && groups.reduce((sum, group) => sum + (group.count ?? 0), 0) === total) {
    return joinList(groups.map((group) => countedLabel(group.label, group.labelPlural, group.count ?? 1)));
  }
  if (!isProperLabel(named)) return `${total} ${named}`;
  const one = total === 1 ? named : singularize(named);
  return total <= 1 ? one : `${one} and ${count(total - 1, 'other')}`;
}

function nameForToken(token: string, ctx: TextContext): string {
  if (HYPHENATED_WORDS.has(token)) return token;
  if (ctx.items[token] || equipmentNoun(token)) return itemNoun(token, ctx);
  if (ctx.spells[token]) return ctx.spells[token];
  if (spellCatalogName(token)) return spellCatalogName(token) ?? prettifyId(token);
  const magic = magicItemTemplateName(token);
  if (magic) return magic;
  const monster = monsterTemplateLabels(token);
  if (monster) return monster.label;
  if (ctx.areas[token]) return ctx.areas[token];
  return prettifyId(token);
}

/**
 * Replace the em dashes and en dashes in bxapi's wording, which the text layer never emits. A dash between
 * numbers becomes a hyphen. A dash before a clause, as in `the spell is disrupted \u2014 the spell is lost`,
 * becomes `, and`, and any other dash becomes a comma.
 */
export function removeDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
    .replace(/\s*[\u2013\u2014]\s*(?=(?:the|a|an|it|its|both|they|exhaustion)\b|[A-Z])/g, ', and ')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\u2212/g, '-');
}

/** Rewrite osrlib's wording that reads badly once its IDs are names: map cells, empty lists, and `town town`. */
function tidyWording(text: string, ctx: TextContext): string {
  return (
    text
      .replace(ENTERS_PLACE, (_match, kind: string, id: string, level: string) =>
        kind === 'dungeon'
          ? `The party enters ${placeInSentence(dungeonName(id, ctx))}, level ${level}.`
          : `The party enters ${placeInSentence(areaName(id, ctx))}.`,
      )
      .replace(
        ENCOUNTER,
        (_match, list: string, feet: string) => `Encounter: ${encounterList(list, ctx)} at ${feet}'`,
      )
      .replace(ENTERS_TOWN, () => `The party arrives in ${ctx.townName ?? 'town'}.`)
      .replace(
        ENTERS_LEVEL,
        (_match, dungeon: string, level: string) =>
          `The party reaches level ${level} of ${placeInSentence(dungeonName(dungeon, ctx))}.`,
      )
      .replace(MOVES_TO_CELL, (_match, facing: string) => `The party moves ${facing}.`)
      .replace(DOOR_OF_CELL, (_match, t: string, side: string) => `${t}he ${side} door`)
      // osrlib writes "leave behind ." when the fallen dropped only coins worth less than 1 gp.
      .replace(/\bleave behind \./g, 'leave a few coins behind.')
      // osrlib writes "acquires ." when the goods were coins worth less than 1 gp.
      .replace(NOTHING_LISTED, '$1 a few coins')
  );
}

/** Capitalize the first letter of the string and the first letter after each sentence end. */
function capitalizeSentences(text: string): string {
  return capitalizeFirst(text).replace(
    /([.!?]\s+)([a-z])/g,
    (_match, end: string, letter: string) => `${end}${letter.toUpperCase()}`,
  );
}

/**
 * Replace every ID pattern in a bxapi message with a name: `character-NNNN`, `group-NNNN`, `monster-NNNN`,
 * `npc-NNNN`, `effect-NNNN`, item instance IDs, `town-cleric`, snake_case catalog IDs, and the dungeon, area,
 * and trap IDs in the messages bxapi writes. Names that the context doesn't know degrade to a readable phrase.
 */
export function humanizeMessage(message: string, ctx: TextContext): string {
  let text = tidyWording(message, ctx);
  text = text.replace(MONSTER_WITH_TEMPLATE, (_match, id: string, template: string) => {
    // The template ID never reaches the text. A built-in template is what the players saw. An adventure's own
    // template can disguise the monster, so the monster reads by what the context knows of it.
    const known = ctx.monsters[id];
    if (known) return entityName(id, ctx);
    const labels = monsterTemplateLabels(template);
    return labels ? withArticle(labels.label) : entityName(id, ctx);
  });
  text = text.replace(EFFECT_WITH_KIND, (_match, kind: string) => `The ${prettifyId(kind)} effect`);
  text = text.replace(ENTITY_ID_PATTERN, (id) => entityName(id, ctx));
  text = text.replace(
    TRAP_REF,
    (_match, dungeon: string, level: string, area: string) =>
      `the trap in ${placeInSentence(areaName(area, ctx, dungeon, Number(level)))}`,
  );
  text = text.replace(DUNGEON_OR_AREA, (_match, kind: string, id: string) =>
    kind === 'dungeon' ? dungeonName(id, ctx) : placeInSentence(areaName(id, ctx)),
  );
  text = text.replace(SNAKE_OR_KEBAB_TOKEN, (token) => nameForToken(token, ctx));
  return capitalizeSentences(removeDashes(text));
}

/** Run `humanizeMessage` over a list of messages. */
export function humanizeMessages(messages: readonly string[], ctx: TextContext): string[] {
  return messages.map((message) => humanizeMessage(message, ctx));
}
