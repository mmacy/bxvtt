import { describe, expect, it } from 'vitest';
import { ClientMessage, CreateUserRequest, parseRollCommand, PostFeedRequest } from './index';

describe('parseRollCommand', () => {
  it('reads /roll and /r with a comment', () => {
    expect(parseRollCommand('/roll 2d6+1 for damage')).toEqual({
      expression: '2d6+1',
      comment: 'for damage',
      secret: false,
    });
    expect(parseRollCommand('/r 1d20')).toEqual({ expression: '1d20', comment: '', secret: false });
  });

  it('reads a secret roll', () => {
    expect(parseRollCommand('/roll secret 1d100 wandering')).toEqual({
      expression: '1d100',
      comment: 'wandering',
      secret: true,
    });
  });

  it('treats anything else as chat', () => {
    expect(parseRollCommand('rolling along')).toBeNull();
    expect(parseRollCommand('/roll')).toBeNull();
    expect(parseRollCommand('/rolls 1d6')).toBeNull();
  });
});

describe('request schemas', () => {
  it('trims display names and refuses control characters', () => {
    expect(CreateUserRequest.parse({ name: '  Wren ' }).name).toBe('Wren');
    expect(CreateUserRequest.safeParse({ name: 'W\u001bren' }).success).toBe(false);
    expect(CreateUserRequest.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
  });

  it('refuses unknown fields in bxvtt bodies', () => {
    expect(PostFeedRequest.safeParse({ text: 'hi', extra: 1 }).success).toBe(false);
  });

  it('parses each client message and refuses an unknown one', () => {
    expect(ClientMessage.parse({ type: 'heartbeat' })).toEqual({ type: 'heartbeat' });
    expect(
      ClientMessage.safeParse({ type: 'ping', dungeon_id: 'barrow', level_number: 1, x: 1.5, y: 0 }).success,
    ).toBe(true);
    expect(
      ClientMessage.safeParse({ type: 'ping', dungeon_id: 'barrow', level_number: 1, x: 1e9, y: 0 }).success,
    ).toBe(false);
    expect(ClientMessage.safeParse({ type: 'shout' }).success).toBe(false);
  });
});
