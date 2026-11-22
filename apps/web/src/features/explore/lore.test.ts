import type { FeedEntry, GameEvent } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import {
  emptyLore,
  learnFromEvents,
  learnFromFeed,
  learnFromRefusal,
  readStoredDoors,
  useLoreStore,
  observeLocation,
  type PartyLocation,
} from './lore';

const at = (x: number, y: number, level = 1): PartyLocation => ({
  kind: 'dungeon',
  dungeon_id: 'priory',
  level_number: level,
  position: [x, y],
  facing: 'north',
});

const event = (fields: Record<string, unknown>) =>
  ({ visibility: 'player', ...fields }) as unknown as GameEvent;

describe('learnFromRefusal', () => {
  it('remembers a door that bxapi says is locked, on the side the party tried', () => {
    const lore = learnFromRefusal(
      emptyLore('s'),
      { command_type: 'open_door', direction: 'south' },
      [{ code: 'exploration.door.locked', params: {} }],
      at(2, 18),
    );
    // The south side of (2, 18) is the north side of (2, 19).
    expect(lore.doors['priory:1:2,19:north']).toEqual({ locked: true });
  });

  it('remembers who is locked out of a lock', () => {
    const lore = learnFromRefusal(
      emptyLore('s'),
      { command_type: 'pick_lock', direction: 'west', character_id: 'character-0002' },
      [{ code: 'exploration.lock.locked_out', params: { character: 'character-0002' } }],
      at(5, 5),
    );
    expect(lore.doors['priory:1:5,5:west']?.pickFailed).toEqual(['character-0002']);
  });

  it('learns nothing from a command without a direction', () => {
    const before = emptyLore('s');
    const after = learnFromRefusal(
      before,
      { command_type: 'search' },
      [{ code: 'exploration.door.locked', params: {} }],
      at(1, 1),
    );
    expect(after).toBe(before);
  });
});

describe('learnFromEvents', () => {
  it('follows a stuck door until it is forced open', () => {
    let lore = learnFromEvents(
      emptyLore('s'),
      [event({ event_type: 'door', code: 'exploration.door.stuck', x: 3, y: 4, direction: 'east' })],
      at(3, 4),
    );
    expect(lore.doors['priory:1:4,4:west']?.stuck).toBe(true);
    lore = learnFromEvents(
      lore,
      [event({ event_type: 'door', code: 'exploration.door.forced', x: 3, y: 4, direction: 'east' })],
      at(3, 4),
    );
    expect(lore.doors['priory:1:4,4:west']?.stuck).toBe(false);
  });

  it('records what a listener heard at the door beside the party', () => {
    const lore = learnFromEvents(
      emptyLore('s'),
      [
        event({
          event_type: 'listened',
          code: 'exploration.listen.heard',
          character_id: 'character-0001',
          direction: 'north',
        }),
      ],
      at(7, 7),
    );
    expect(lore.doors['priory:1:7,7:north']).toEqual({ heard: 'noise', listened: ['character-0001'] });
  });

  it('remembers a failed pick when bxapi accepts it and nothing unlocks', () => {
    const lore = learnFromEvents(emptyLore('s'), [], at(2, 2), {
      command_type: 'pick_lock',
      direction: 'east',
      character_id: 'character-0002',
    });
    expect(lore.doors['priory:1:3,2:west']?.pickFailed).toEqual(['character-0002']);
  });
});

describe('learnFromFeed', () => {
  const entry = (seq: number, revision: number, events: GameEvent[]) =>
    ({
      seq,
      created_at: '2026-11-22T05:18:28Z',
      user_id: null,
      visibility: 'everyone',
      to: [],
      kind: 'game',
      command_type: 'open_door',
      revision,
      session_id: 's',
      events,
      messages: [],
    }) as unknown as FeedEntry;

  it('reads each entry once, after this browser has seen its revision', () => {
    const opened = event({
      event_type: 'door',
      code: 'exploration.door.unlocked',
      x: 1,
      y: 1,
      direction: 'north',
    });
    let lore = observeLocation(emptyLore('s'), 4, at(1, 1));
    lore = learnFromFeed(lore, [entry(10, 5, [opened])], 's', 4);
    expect(lore.doors).toEqual({});
    lore = observeLocation(lore, 5, at(1, 1));
    lore = learnFromFeed(lore, [entry(10, 5, [opened])], 's', 5);
    expect(lore.doors['priory:1:1,1:north']).toEqual({ locked: false, unlocked: true });
    const again = learnFromFeed(lore, [entry(10, 5, [opened])], 's', 5);
    expect(again).toBe(lore);
  });
});

describe('stored lore', () => {
  it('keeps what the table learned across a reload of the page', () => {
    useLoreStore.setState({ byTable: {} });
    useLoreStore
      .getState()
      .update('tbl', 'ses', (lore) =>
        learnFromRefusal(
          lore,
          { command_type: 'open_door', direction: 'south' },
          [{ code: 'exploration.door.locked', params: {} }],
          at(2, 18),
        ),
      );
    // A reload starts with an empty store, and the first update reads what session storage kept.
    useLoreStore.setState({ byTable: {} });
    expect(readStoredDoors('tbl', 'ses')).toEqual({ 'priory:1:2,19:north': { locked: true } });
    useLoreStore.getState().update('tbl', 'ses', (lore) => lore);
    expect(useLoreStore.getState().byTable['tbl']?.doors['priory:1:2,19:north']).toEqual({ locked: true });
  });
});
