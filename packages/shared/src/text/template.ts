/**
 * A small template engine for rejection text.
 *
 * A template is a sentence with placeholders: `{character|member} isn't in the front rank.` A placeholder
 * names a rejection param and, after a bar, how to format it. Keeping the placeholders in the template string
 * lets the tests check that every template uses only the params that osrlib passes with its code.
 */

import { classCatalogName } from './catalog';
import { commandInfo } from './commands';
import {
  areaName,
  dungeonName,
  entityName,
  itemName,
  itemNoun,
  memberName,
  monsterName,
  groupName,
  spellName,
  type TextContext,
} from './context';
import {
  capitalizeFirst,
  classInSentence,
  coinName,
  count,
  formatFeet,
  formatGold,
  joinList,
  lowerFirst,
  pluralize,
  prettifyId,
} from './format';
import {
  abilityLabel,
  battleActionLabel,
  classLabel,
  conditionLabel,
  restKindLabel,
  saveVersus,
  sessionModeLabel,
} from './labels';

export type ParamValue = number | string | readonly (number | string)[];
/** A message's params. bxapi can send a param as `null`, and the text reads `null` as a missing param. */
export type ParamMap = Readonly<Record<string, ParamValue | null | undefined>>;

/** One wording of a message, used when every param in `when` is present. */
export interface TemplateVariant {
  when?: readonly string[];
  text: string;
}

export type Template = string | readonly TemplateVariant[];

const PLACEHOLDER = /\{([a-z_]+)(?:\|([^}]+))?\}/g;

const COIN_IDS = new Set(['pp', 'gp', 'ep', 'sp', 'cp']);

/** Names of the formats that a template can use after a bar. */
export const TEMPLATE_FORMATS = [
  'raw',
  'member',
  'possessive',
  'entity',
  'monster',
  'group',
  'item',
  'itemcap',
  'carried',
  'spell',
  'spellcap',
  'class',
  'classes',
  'classcap',
  'ability',
  'condition',
  'restraint',
  'feet',
  'gp',
  'coin',
  'direction',
  'mode',
  'modephrase',
  'command',
  'action',
  'save',
  'members',
  'inreverse',
  'spelllist',
  'moveReason',
  'questStatus',
  'service',
  'dungeon',
  'area',
  'rest',
  'number',
] as const;

function first(value: ParamValue | null | undefined): number | string | undefined {
  if (value === null) return undefined;
  return Array.isArray(value) ? value[0] : (value as number | string | undefined);
}

function asText(value: ParamValue | null | undefined): string | undefined {
  const single = first(value);
  return single === undefined || single === '' ? undefined : String(single);
}

function formatClass(value: string): string {
  return classInSentence(classCatalogName(value) ?? prettifyId(value));
}

const MODE_PHRASES: Record<string, string> = {
  town: 'while in town',
  exploring: 'while exploring',
  encounter: 'during an encounter',
  battle: 'during a battle',
  game_over: 'after the game has ended',
  victory: 'after the adventure is complete',
};

const MOVE_REASONS: Record<string, string> = {
  overloaded: 'a party member is overloaded',
};

const QUEST_STATUSES: Record<string, string> = {
  inactive: 'not active yet',
  active: 'already active',
  completed: 'already finished',
};

function formatValue(value: ParamValue | null | undefined, format: string, ctx: TextContext): string {
  const text = asText(value);
  const [name, argument] = format.split(':') as [string, string | undefined];
  switch (name) {
    case 'member':
      return memberName(text, ctx);
    case 'possessive': {
      const name = memberName(text, ctx);
      return /s$/i.test(name) ? `${name}'` : `${name}'s`;
    }
    case 'entity':
      return text ? entityName(text, ctx) : 'someone';
    case 'monster':
      return monsterName(text, ctx);
    case 'group':
      return groupName(text, ctx);
    case 'item':
      return text ? itemName(text, ctx) : 'that item';
    case 'itemcap':
      return capitalizeFirst(text ? itemName(text, ctx) : 'that item');
    case 'carried':
      if (text && COIN_IDS.has(text)) return `enough ${coinName(text)}`;
      return text ? itemName(text, ctx) : 'the item';
    case 'spell':
      return text ? spellName(text, ctx) : 'that spell';
    case 'spellcap':
      return capitalizeFirst(text ? spellName(text, ctx) : 'that spell');
    case 'class':
      return text ? formatClass(text) : 'that class';
    case 'classes':
      return text ? pluralize(formatClass(text)) : 'that class';
    case 'classcap':
      return capitalizeFirst(text ? pluralize(formatClass(text)) : 'that class');
    case 'ability':
      return text ? abilityLabel(text) : 'that ability';
    case 'condition':
      return text ? lowerFirst(conditionLabel(text)) : 'incapacitated';
    case 'restraint':
      return text ? prettifyId(text) : 'restrained';
    case 'feet':
      return typeof first(value) === 'number' ? formatFeet(first(value) as number) : 'some distance';
    case 'gp':
      return typeof first(value) === 'number' ? formatGold(first(value) as number) : 'a price';
    case 'coin':
      return text ? coinName(text) : 'coins';
    case 'direction':
      return text ? text.toLowerCase() : 'that';
    case 'mode':
      return text ? prettifyId(text) : 'that';
    case 'modephrase':
      return text ? (MODE_PHRASES[text] ?? `in ${sessionModeLabel(text).toLowerCase()} mode`) : 'right now';
    case 'command':
      return text ? commandInfo(text).phrase : 'do that';
    case 'action':
      return text ? lowerFirst(battleActionLabel(text)) : 'that action';
    case 'save':
      return text ? saveVersus(text) : 'that saving throw';
    case 'members': {
      const ids = (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(String);
      return ids.length === 0 ? 'no one' : joinList(ids.map((id) => memberName(id, ctx)));
    }
    case 'inreverse':
      return Number(first(value)) === 1 || first(value) === 'true' ? ' in its reversed form' : '';
    case 'spelllist':
      return text ? classInSentence(classLabel(text)) : 'that';
    case 'moveReason':
      return text ? (MOVE_REASONS[text] ?? prettifyId(text)) : 'of a problem';
    case 'questStatus':
      return text ? (QUEST_STATUSES[text] ?? prettifyId(text)) : 'in the wrong state';
    case 'service':
      return text ? lowerFirst(prettifyId(text)) : 'that service';
    case 'dungeon':
      return text ? dungeonName(text, ctx) : 'that dungeon';
    case 'area':
      return text ? areaName(text, ctx) : 'that area';
    case 'rest':
      return text ? restKindLabel(text).toLowerCase() : 'a rest';
    case 'number':
      return text ?? '0';
    case 'count': {
      const n = Number(first(value));
      return Number.isFinite(n) ? count(n, argument ?? 'thing') : `some ${pluralize(argument ?? 'thing')}`;
    }
    case 'itemnoun':
      return text ? itemNoun(text, ctx) : 'item';
    case 'raw':
    default:
      return text ?? 'that';
  }
}

/** The names of every placeholder in a template string, with its format. */
export function templatePlaceholders(text: string): Array<{ name: string; format: string }> {
  const found: Array<{ name: string; format: string }> = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    found.push({ name: match[1] ?? '', format: match[2] ?? 'raw' });
  }
  return found;
}

/** Return the variants of a template as a list. */
export function templateVariants(template: Template): readonly TemplateVariant[] {
  return typeof template === 'string' ? [{ text: template }] : template;
}

function present(params: ParamMap, key: string): boolean {
  const value = params[key];
  return (
    value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)
  );
}

/** Pick the first variant whose required params are all present, and fill in its placeholders. */
export function renderTemplate(template: Template, params: ParamMap, ctx: TextContext): string {
  const variants = templateVariants(template);
  const chosen =
    variants.find((variant) => (variant.when ?? []).every((key) => present(params, key))) ??
    variants[variants.length - 1];
  if (!chosen) return '';
  const filled = chosen.text.replace(PLACEHOLDER, (_match, name: string, format?: string) =>
    formatValue(params[name], format ?? 'raw', ctx),
  );
  return capitalizeFirst(filled);
}
