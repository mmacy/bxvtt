import { describe, expect, it } from 'vitest';
import schemas from '../testing/commandSchemas.json';
import {
  buildCommand,
  commandFields,
  emptyValue,
  initialValue,
  validateFields,
  type FieldSpec,
  type JsonSchema,
} from './model';

function fields(commandType: keyof typeof schemas): FieldSpec[] {
  return commandFields(schemas[commandType].json_schema as JsonSchema);
}

function field(list: FieldSpec[], name: string): FieldSpec {
  const found = list.find((f) => f.name === name);
  if (!found) throw new Error(`No field ${name}`);
  return found;
}

function start(list: FieldSpec[]): Record<string, unknown> {
  return Object.fromEntries(list.map((f) => [f.name, initialValue(f)]));
}

describe('commandFields', () => {
  it('reads coins as an object of whole numbers with defaults', () => {
    const coins = field(fields('grant_coins'), 'coins');
    expect(coins.node.kind).toBe('object');
    if (coins.node.kind !== 'object') return;
    expect(coins.node.fields.map((f) => f.name)).toEqual(['pp', 'gp', 'ep', 'sp', 'cp']);
    expect(emptyValue(coins.node)).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  });

  it('reads a flag value as a union of text, number, and yes or no', () => {
    const value = field(fields('set_flag'), 'value');
    expect(value.node.kind).toBe('union');
    if (value.node.kind !== 'union') return;
    expect(value.node.variants.map((v) => v.kind)).toEqual(['string', 'integer', 'boolean']);
  });

  it('reads door fields as nullable booleans that start unset', () => {
    const list = fields('set_door_state');
    const open = field(list, 'open');
    expect(open.node).toEqual({ kind: 'nullable', inner: { kind: 'boolean' } });
    expect(initialValue(open)).toBeUndefined();
    expect(field(list, 'direction').node).toEqual({
      kind: 'enum',
      options: ['north', 'east', 'south', 'west'],
    });
  });

  it('reads a party location with a fixed-length cell tuple', () => {
    const location = field(fields('place_party'), 'location');
    if (location.node.kind !== 'object') throw new Error('expected an object');
    const position = field(location.node.fields, 'position');
    expect(position.node.kind).toBe('nullable');
    if (position.node.kind !== 'nullable') return;
    expect(position.node.inner).toEqual({ kind: 'tuple', items: [{ kind: 'integer' }, { kind: 'integer' }] });
  });

  it('reads a character for add_member, with ability scores keyed by ability', () => {
    const character = field(fields('add_member'), 'character');
    if (character.node.kind !== 'object') throw new Error('expected an object');
    const scores = field(character.node.fields, 'scores');
    expect(scores.node).toEqual({
      kind: 'map',
      keys: ['str', 'int', 'wis', 'dex', 'con', 'cha'],
      value: { kind: 'integer' },
    });
  });
});

describe('validateFields and buildCommand', () => {
  it('asks for every required field', () => {
    const list = fields('grant_item');
    const errors = validateFields(list, start(list));
    expect(errors).toEqual({ character_id: 'Enter a value.', item_id: 'Enter a value.' });
  });

  it('checks minimums inside nested objects', () => {
    const list = fields('grant_coins');
    const values = {
      ...start(list),
      character_id: 'character-0001',
      coins: { pp: 0, gp: -2, ep: 0, sp: 0, cp: 0 },
    };
    expect(validateFields(list, values)).toEqual({ 'coins.gp': 'Enter 0 or more.' });
  });

  it('accepts a flag set to true and sends it as a boolean', () => {
    const list = fields('set_flag');
    const values = { ...start(list), key: 'crypt.lever', value: true };
    expect(validateFields(list, values)).toEqual({});
    expect(buildCommand('set_flag', values)).toEqual({
      command_type: 'set_flag',
      key: 'crypt.lever',
      value: true,
    });
  });

  it('leaves out door fields the referee left unchanged', () => {
    const list = fields('set_door_state');
    const values = {
      ...start(list),
      dungeon_id: 'priory',
      level_number: 1,
      x: 6,
      y: 3,
      direction: 'west',
      open: true,
    };
    expect(validateFields(list, values)).toEqual({});
    expect(buildCommand('set_door_state', values)).toEqual({
      command_type: 'set_door_state',
      dungeon_id: 'priory',
      level_number: 1,
      x: 6,
      y: 3,
      direction: 'west',
      open: true,
    });
  });

  it('requires both parts of a cell once a position is set', () => {
    const list = fields('place_party');
    const values = {
      location: { kind: 'dungeon', dungeon_id: 'priory', level_number: 1, position: [3, undefined] },
    };
    expect(validateFields(list, values)).toEqual({ 'location.position.1': 'Enter a value.' });
  });
});

describe('unions of objects', () => {
  it('tells an armour template from a weapon template by its item type', async () => {
    const { default: character } = await import('../testing/storedCharacter.json');
    const list = fields('add_member');
    expect(validateFields(list, { character })).toEqual({});
  });
});
