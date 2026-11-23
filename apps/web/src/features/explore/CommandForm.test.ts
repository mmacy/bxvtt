import { describe, expect, it } from 'vitest';
import { commandFromValues, fieldsFromSchema, firstMissingField } from './CommandForm';

/** A trimmed copy of the schema bxapi serves for `give_items`. */
const giveItems = {
  $defs: {
    Coins: {
      properties: {
        gp: { default: 0, minimum: 0, type: 'integer' },
        sp: { default: 0, minimum: 0, type: 'integer' },
      },
      type: 'object',
    },
  },
  properties: {
    command_type: { const: 'give_items', type: 'string' },
    source: { anyOf: [{ minLength: 1, type: 'string' }, { type: 'null' }], default: null },
    character_id: { type: 'string' },
    recipient_id: { type: 'string' },
    item_ids: { default: [], items: { type: 'string' }, type: 'array' },
    coins: { $ref: '#/$defs/Coins' },
  },
  required: ['character_id', 'recipient_id'],
};

const rest = {
  properties: {
    kind: { enum: ['turn', 'night', 'day'], type: 'string' },
    hidden: { default: false, type: 'boolean' },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
  },
  required: ['kind'],
};

describe('fieldsFromSchema', () => {
  it('turns a schema into fields, leaves out the command type and source, and follows references', () => {
    expect(fieldsFromSchema(giveItems, 'character_id')).toEqual([
      { name: 'character_id', kind: 'member', required: true, acting: true },
      { name: 'recipient_id', kind: 'member', required: true, acting: false },
      { name: 'item_ids', kind: 'items', required: false },
      {
        name: 'coins',
        kind: 'group',
        required: false,
        fields: [
          { name: 'gp', kind: 'number', required: false, integer: true, min: 0, max: undefined },
          { name: 'sp', kind: 'number', required: false, integer: true, min: 0, max: undefined },
        ],
      },
    ]);
  });

  it('reads enums, booleans, and optional strings', () => {
    expect(fieldsFromSchema(rest, null)).toEqual([
      { name: 'kind', kind: 'enum', required: true, values: ['turn', 'night', 'day'] },
      { name: 'hidden', kind: 'boolean', required: false, initial: false },
      { name: 'note', kind: 'text', required: false },
    ]);
  });
});

describe('firstMissingField', () => {
  it('names the first required field without a value, and skips booleans and groups', () => {
    const fields = fieldsFromSchema(giveItems, 'character_id');
    expect(firstMissingField(fields, {})?.name).toBe('character_id');
    expect(firstMissingField(fields, { character_id: 'character-0001', recipient_id: '' })?.name).toBe(
      'recipient_id',
    );
    expect(
      firstMissingField(fields, { character_id: 'character-0001', recipient_id: 'character-0002' }),
    ).toBeUndefined();
    expect(firstMissingField(fieldsFromSchema(rest, null), { kind: 'turn' })).toBeUndefined();
  });
});

describe('commandFromValues', () => {
  it('builds the command and leaves out what the user left empty', () => {
    const fields = fieldsFromSchema(giveItems, 'character_id');
    expect(
      commandFromValues('give_items', fields, {
        character_id: 'character-0001',
        recipient_id: 'character-0002',
        item_ids: [],
        coins: { gp: 5 },
      }),
    ).toEqual({
      command_type: 'give_items',
      character_id: 'character-0001',
      recipient_id: 'character-0002',
      coins: { gp: 5 },
    });
  });
});

describe('spell choices', () => {
  const prepare = {
    $defs: {
      MemorizedSpell: { properties: { spell_id: { type: 'string' }, reversed: { type: 'boolean' } } },
    },
    properties: {
      character_id: { type: 'string' },
      selections: { default: [], items: { $ref: '#/$defs/MemorizedSpell' }, type: 'array' },
    },
    required: ['character_id'],
  };

  it('reads an array of spell selections as a spell list, and sends one selection per copy', () => {
    const fields = fieldsFromSchema(prepare, 'character_id');
    expect(fields[1]).toEqual({ name: 'selections', kind: 'spellList', required: false });
    expect(
      commandFromValues('prepare_spells', fields, {
        character_id: 'character-0004',
        selections: ['sleep', 'sleep'],
      }),
    ).toEqual({
      command_type: 'prepare_spells',
      character_id: 'character-0004',
      selections: [{ spell_id: 'sleep' }, { spell_id: 'sleep' }],
    });
  });
});
