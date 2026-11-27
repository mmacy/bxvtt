import { describe, expect, it } from 'vitest';
import openapi from '../bxapi/openapi.json' with { type: 'json' };
import codes from './data/codes.json' with { type: 'json' };
import {
  COMMAND_FIELD_TEXT,
  COMMAND_INFO,
  DECLARATION_FIELD_TEXT,
  COIN_FIELD_TEXT,
  LOCATION_FIELD_TEXT,
  SELECTION_FIELD_TEXT,
  hasCommandFieldText,
} from './commands';
import { emptyContext } from './context';
import { BATTLE_ACTION_VALUES } from './labels';
import { describeEvent, fallbackEventText, isKnownEventType } from './events';
import {
  ADJUSTMENT_MERGED_PARAMS,
  DECLARATION_CODES,
  REJECTION_KEY_SUFFIXES,
  REJECTION_TEMPLATES,
  declarationParams,
  describeRejection,
} from './rejections';
import { TEMPLATE_FORMATS, templatePlaceholders, templateVariants } from './template';
import { EVENT_SAMPLES } from './fixtures/event-samples';

type Schema = { properties?: Record<string, unknown>; oneOf?: Array<{ $ref: string }> };
const schemas = openapi.components.schemas as unknown as Record<string, Schema>;
const rejectionCodes = Object.keys(codes.rejections);
const eventTypes = Object.keys(codes.events);

/** The template keys of a code: the code itself, or the code with each of its suffixes. */
function templateKeys(code: string): string[] {
  const suffixes = REJECTION_KEY_SUFFIXES[code];
  return suffixes ? suffixes.map((suffix) => `${code}.${suffix}`) : [code];
}

/** The code a template key belongs to. */
function codeOfKey(key: string): string {
  const base = key.slice(0, key.lastIndexOf('.'));
  return base in REJECTION_KEY_SUFFIXES ? base : key;
}

const DASH = new RegExp('[\\u2013\\u2014]');
const FORMATS = new Set<string>(TEMPLATE_FORMATS);
const IDENTITY_FORMATS = new Set(['count', 'itemnoun']);
const ID_PARAMS = new Set(['character', 'caster', 'attacker', 'target', 'monster', 'replacement', 'item']);
const NUMERIC_PARAMS = new Set([
  'distance_feet',
  'range_feet',
  'cost_gp',
  'score',
  'amount',
  'minimum',
  'maximum',
  'caster_level',
  'x',
  'y',
  'expected',
  'supplied',
  'capacity',
  'chosen',
  'slots',
  'selected',
  'spell_level',
  'allowed',
  'points_available',
  'points_spent',
  'max_points',
  'lowest',
  'highest',
  'uses_per_day',
  'reversed',
]);

describe('rejection coverage', () => {
  it('has a template for every rejection code that osrlib can return', () => {
    const missing = rejectionCodes.flatMap(templateKeys).filter((key) => !(key in REJECTION_TEMPLATES));
    expect(missing).toEqual([]);
  });

  it('has no template for a code that osrlib no longer returns', () => {
    const extra = Object.keys(REJECTION_TEMPLATES).filter((key) => !(codeOfKey(key) in codes.rejections));
    expect(extra).toEqual([]);
  });

  it.each(rejectionCodes)('%s uses only params that osrlib passes with the code', (code) => {
    const known = new Set<string>([
      ...((codes.rejections as Record<string, { params: string[] }>)[code]?.params ?? []),
      ...declarationParams(code),
      ...(ADJUSTMENT_MERGED_PARAMS[code] ?? []),
    ]);
    for (const templateKey of templateKeys(code)) {
      const template = REJECTION_TEMPLATES[templateKey];
      expect(template, templateKey).toBeDefined();
      if (template === undefined) continue;
      const variants = templateVariants(template);
      for (const variant of variants) {
        for (const key of variant.when ?? []) expect(known, `${templateKey}: when ${key}`).toContain(key);
        for (const placeholder of templatePlaceholders(variant.text)) {
          expect(known, `${templateKey}: {${placeholder.name}}`).toContain(placeholder.name);
          const format = placeholder.format.split(':')[0] ?? '';
          expect(
            FORMATS.has(format) || IDENTITY_FORMATS.has(format),
            `${templateKey}: format ${placeholder.format}`,
          ).toBe(true);
        }
      }
      const last = variants[variants.length - 1];
      expect(last?.when ?? [], `${templateKey}: the last variant is the fallback`).toEqual([]);
    }
  });

  it('writes every template without a dash, an exclamation mark, or a raw ID', () => {
    for (const [code, template] of Object.entries(REJECTION_TEMPLATES)) {
      for (const variant of templateVariants(template)) {
        expect(variant.text, code).not.toMatch(DASH);
        expect(variant.text, code).not.toContain('!');
        expect(variant.text, code).not.toMatch(/\b[a-z]+-\d{4}\b/);
      }
    }
  });

  it('renders every code with no params to a readable sentence', () => {
    for (const code of rejectionCodes) {
      const text = describeRejection({ code, params: {} }, emptyContext());
      expect(text.length, code).toBeGreaterThan(10);
      expect(text, code).not.toMatch(/\{|\}|undefined|NaN|\[object/);
      expect(text, code).toMatch(/[.)]$/);
    }
  });

  it('renders every code with its full params to a sentence with no raw ID', () => {
    for (const code of rejectionCodes) {
      const entry = (codes.rejections as Record<string, { params: string[] }>)[code];
      const params: Record<string, string | number> = {};
      for (const key of entry?.params ?? [])
        params[key] = ID_PARAMS.has(key) ? 'character-0001' : NUMERIC_PARAMS.has(key) ? 3 : 'elvish';
      const text = describeRejection({ code, params }, emptyContext());
      expect(text, code).not.toMatch(/\{|\}|undefined|NaN|\[object|character-0001/);
      expect(text, code).not.toMatch(DASH);
    }
  });

  it('lists only codes that osrlib defines as codes a declaration can refuse with the member named', () => {
    expect([...DECLARATION_CODES].filter((code) => !(code in codes.rejections))).toEqual([]);
  });

  it('renders every declaration code with the declaring member named and no raw ID', () => {
    const ctx = { ...emptyContext(), members: { 'character-0001': { name: 'Wren' } } };
    for (const code of DECLARATION_CODES) {
      const entry = (codes.rejections as Record<string, { params: string[] }>)[code];
      // The declaring member is also the attacker or the caster of a kernel check that a declaration passes through.
      const ids: Record<string, string> = {
        character: 'character-0001',
        attacker: 'character-0001',
        caster: 'character-0001',
        target: code.startsWith('session.command.') ? 'character-0002' : 'monster-0001',
        monster: 'monster-0001',
        item: 'magic-item-0001',
        replacement: 'character-0002',
      };
      const params: Record<string, string | number> = { character: 'character-0001' };
      for (const key of [...(entry?.params ?? []), ...declarationParams(code)])
        params[key] = ids[key] ?? (NUMERIC_PARAMS.has(key) ? 3 : 'elvish');
      const text = describeRejection({ code, params }, ctx);
      expect(text, code).toContain('Wren');
      expect(text, code).not.toMatch(/\{|\}|undefined|NaN|\[object|\b[a-z-]+-\d{4}\b/);
      expect(text, code).not.toMatch(DASH);
    }
  });

  it('builds a sentence from the words of a code it does not know', () => {
    expect(describeRejection({ code: 'items.equip.too_heavy', params: {} })).toBe(
      "You can't do that: equip too heavy.",
    );
  });
});

describe('event coverage', () => {
  const openapiEvents = Object.keys(
    ((
      schemas.CommandOutcome?.properties as Record<
        string,
        { items: { discriminator: { mapping: Record<string, string> } } }
      >
    ).events?.items.discriminator.mapping ?? {}) as Record<string, string>,
  );

  it('knows every event type in the OpenAPI document and in osrlib', () => {
    expect(openapiEvents.length).toBe(eventTypes.length);
    expect(openapiEvents.filter((type) => !isKnownEventType(type))).toEqual([]);
    expect(eventTypes.filter((type) => !isKnownEventType(type))).toEqual([]);
    expect([...openapiEvents].sort()).toEqual([...eventTypes].sort());
  });

  it('has a sample for every event type', () => {
    expect(eventTypes.filter((type) => !(type in EVENT_SAMPLES))).toEqual([]);
    expect(Object.keys(EVENT_SAMPLES).filter((type) => !eventTypes.includes(type))).toEqual([]);
  });

  const cases = eventTypes.flatMap((type) =>
    ((codes.events as Record<string, { codes: string[]; visibility: string }>)[type]?.codes ?? []).map(
      (code) => [type, code] as const,
    ),
  );

  it('covers the number of codes that osrlib defines', () => {
    expect(cases.length).toBe(141);
  });

  it.each(cases)('%s / %s has its own wording', (type, code) => {
    const sample = EVENT_SAMPLES[type];
    expect(sample).toBeDefined();
    const event = {
      event_type: type,
      code,
      visibility: (codes.events as Record<string, { visibility: string }>)[type]?.visibility ?? 'player',
      ...sample?.base,
      ...sample?.codes?.[code],
    };
    const line = describeEvent(event, emptyContext());
    expect(line.text, `${type} ${code}`).not.toBe(fallbackEventText({ code }));
    expect(line.text).toMatch(/\S/);
    expect(line.text).not.toMatch(
      /undefined|NaN|\[object|\{|\}|character-\d{4}|monster-\d{4}|group-\d{4}|npc-\d{4}|magic-item-\d{4}|valuable-\d{4}|effect-\d{4}|cache-\d{4}/,
    );
    expect(line.eventType).toBe(type);
    expect(line.code).toBe(code);
  });

  it('gives every code of one event type different wording', () => {
    for (const type of eventTypes) {
      const codeList = (codes.events as Record<string, { codes: string[] }>)[type]?.codes ?? [];
      if (codeList.length < 2) continue;
      const sample = EVENT_SAMPLES[type];
      const texts = codeList.map(
        (code) =>
          describeEvent(
            { event_type: type, code, visibility: 'player', ...sample?.base, ...sample?.codes?.[code] },
            emptyContext(),
          ).text,
      );
      expect(new Set(texts).size, `${type}: ${texts.join(' | ')}`).toBe(texts.length);
    }
  });

  it('marks referee-only events with referee visibility', () => {
    for (const type of eventTypes) {
      const visibility = (codes.events as Record<string, { visibility: string }>)[type]?.visibility;
      const sample = EVENT_SAMPLES[type];
      const code = (codes.events as Record<string, { codes: string[] }>)[type]?.codes[0] ?? '';
      const line = describeEvent(
        { event_type: type, code, visibility, ...sample?.base, ...sample?.codes?.[code] },
        emptyContext(),
      );
      expect(line.visibility).toBe(visibility);
    }
  });

  it('falls back to a sentence built from the code for an event type it does not know', () => {
    const line = describeEvent(
      { event_type: 'future_thing', code: 'future.thing.happened', visibility: 'player' },
      emptyContext(),
    );
    expect(line.text).toBe('Future thing happened.');
    expect(line.category).toBe('system');
  });

  it('falls back to bxapi message with the IDs replaced for an event type it does not know', () => {
    const line = describeEvent(
      { event_type: 'future_thing', code: 'future.thing.happened' },
      emptyContext(),
      { message: 'character-0001 does a new thing to group-0001.' },
    );
    expect(line.text).toBe('A party member does a new thing to the monsters.');
  });
});

describe('command coverage', () => {
  const requestBody = (
    openapi.paths as unknown as Record<
      string,
      {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  oneOf: Array<{ $ref: string }>;
                  discriminator: { mapping: Record<string, string> };
                };
              };
            };
          };
        };
      }
    >
  )['/v1/sessions/{session_id}/commands']?.post.requestBody.content['application/json'].schema;
  const mapping = requestBody?.discriminator.mapping ?? {};
  const commandTypes = Object.keys(mapping);

  it('covers every command in the OpenAPI document', () => {
    expect(commandTypes.length).toBe(59);
    expect(commandTypes.filter((type) => !(type in COMMAND_INFO))).toEqual([]);
    expect(Object.keys(COMMAND_INFO).filter((type) => !commandTypes.includes(type))).toEqual([]);
  });

  it.each(commandTypes)('%s has a label, button text, description, and phrase', (type) => {
    const info = COMMAND_INFO[type];
    expect(info?.label).toMatch(/\S/);
    expect(info?.button).toMatch(/\S/);
    expect(info?.description).toMatch(/[.]$/);
    expect(info?.phrase).toMatch(/\S/);
    expect(info?.label).not.toMatch(DASH);
    // Sentence case: no capital letter after the first word, except acronyms and proper terms.
    for (const text of [info?.label ?? '', info?.button ?? '']) expect(text).not.toMatch(/^\S+ [A-Z][a-z]/);
  });

  it('marks referee commands as referee commands', () => {
    const refereeTypes = [
      'grant_item',
      'grant_coins',
      'award_xp',
      'set_flag',
      'spawn_monsters',
      'spawn_npc_party',
      'set_door_state',
      'place_party',
      'advance_time',
      'identify_item',
      'roll_dice',
      'mark_trigger_fired',
      'add_journal_entry',
      'record_note',
      'activate_quest',
      'reveal_objective',
      'complete_objective',
      'complete_quest',
      'end_encounter',
      'remove_item',
      'remove_coins',
      'add_member',
      'remove_member',
    ];
    for (const type of commandTypes)
      expect(COMMAND_INFO[type]?.kind, type).toBe(refereeTypes.includes(type) ? 'referee' : 'play');
  });

  it('has a label and help text for every field of every command', () => {
    const missing: string[] = [];
    for (const [type, ref] of Object.entries(mapping)) {
      const schema = schemas[ref.split('/').pop() ?? ''];
      for (const field of Object.keys(schema?.properties ?? {})) {
        if (field === 'command_type') continue;
        if (!hasCommandFieldText(type, field)) missing.push(`${type}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('labels and describes every battle action that a declaration can take', () => {
    const actions =
      (schemas.BattleDeclaration?.properties?.action as { enum?: string[] } | undefined)?.enum ?? [];
    expect(actions).toContain('hide');
    expect([...BATTLE_ACTION_VALUES].sort()).toEqual([...actions].sort());
  });

  it('has text for the nested fields of declarations, locations, spells, and coins', () => {
    const cover = (schemaName: string, table: Record<string, unknown>) =>
      Object.keys(schemas[schemaName]?.properties ?? {}).filter((field) => !(field in table));
    expect(cover('BattleDeclaration', DECLARATION_FIELD_TEXT)).toEqual([]);
    expect(cover('PartyLocation', LOCATION_FIELD_TEXT)).toEqual([]);
    expect(cover('MemorizedSpell', SELECTION_FIELD_TEXT)).toEqual([]);
    expect(cover('Coins', COIN_FIELD_TEXT)).toEqual([]);
  });

  it('has no field text for a command or field that bxapi does not define', () => {
    const extra: string[] = [];
    for (const [type, fields] of Object.entries(COMMAND_FIELD_TEXT)) {
      const ref = mapping[type];
      const schema = ref ? schemas[ref.split('/').pop() ?? ''] : undefined;
      for (const field of Object.keys(fields))
        if (!(field in (schema?.properties ?? {}))) extra.push(`${type}.${field}`);
    }
    expect(extra).toEqual([]);
  });

  it('writes help text as sentences without dashes', () => {
    const tables = [
      ...Object.values(COMMAND_FIELD_TEXT).flatMap((fields) => Object.values(fields)),
      ...Object.values(DECLARATION_FIELD_TEXT),
      ...Object.values(LOCATION_FIELD_TEXT),
      ...Object.values(SELECTION_FIELD_TEXT),
      ...Object.values(COIN_FIELD_TEXT),
    ];
    for (const { label, help } of tables) {
      expect(help).toMatch(/[.]$/);
      expect(`${label} ${help}`).not.toMatch(DASH);
    }
  });
});
