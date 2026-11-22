import type { SceneCache } from '@bxvtt/shared/protocol';
import { emptyContext } from '@bxvtt/shared/text';
import { describe, expect, it, vi } from 'vitest';
import { canSendCommand, type PermissionContext } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import type { MenuEntry } from '@/ui';
import {
  cacheEntries,
  doorEntries,
  doorLoreText,
  entryLabel,
  lightEntries,
  searchEntries,
  transitionAction,
  transitionDescription,
  type ActionContext,
} from './actions';

/** The player Sam controls Brenna (a fighter) and Wren (a thief). Ruth, the referee, controls everyone. */
function context(role: 'player' | 'referee') {
  const snapshot = fixtureSnapshot('exploring', role);
  const game = snapshot.game;
  if (game === null) throw new Error('The fixture has no game.');
  const permissions: PermissionContext = {
    userId: snapshot.user.id,
    role,
    game,
    settings: snapshot.table.settings,
    lens: true,
  };
  const run = vi.fn();
  const ctx: ActionContext = {
    view: game.view,
    scene: game.scene,
    can: (type, member) => canSendCommand(permissions, type, member).allowed,
    run,
    text: emptyContext(),
  };
  return { ctx, run };
}

function find(entries: MenuEntry[], label: string): MenuEntry | undefined {
  for (const entry of entries) {
    if (entryLabel(entry) === label) return entry;
    if (entry.type === 'submenu') {
      const inner = find(entry.items, label);
      if (inner) return inner;
    }
  }
  return undefined;
}

function select(entries: MenuEntry[], label: string): void {
  const entry = find(entries, label);
  if (!entry || (entry.type !== undefined && entry.type !== 'item'))
    throw new Error(`No item named ${label}.`);
  entry.onSelect?.();
}

describe('doorEntries', () => {
  it('offers a closed door’s actions, with member actions for the members the player controls', () => {
    const { ctx, run } = context('player');
    const entries = doorEntries(ctx, 'north', { open: false, wedged: false });
    const labels = entries.map(entryLabel);
    expect(labels).toEqual([
      'The door to the north',
      'Open it',
      'Force it open',
      'Pick the lock: Wren',
      'Listen at it',
      'Wedge it shut with a spike',
    ]);
    const force = find(entries, 'Force it open');
    expect(force?.type === 'submenu' && force.items.map(entryLabel)).toEqual([
      'Brenna (1 in 6)',
      'Wren (2 in 6)',
    ]);
    select(entries, 'Pick the lock: Wren');
    expect(run).toHaveBeenCalledWith(
      { command_type: 'pick_lock', direction: 'north', character_id: 'character-0002' },
      expect.objectContaining({ nothingText: expect.stringContaining('Wren') }),
    );
  });

  it('offers to close an open door, and nothing to close when it is wedged', () => {
    const { ctx } = context('player');
    expect(doorEntries(ctx, 'east', { open: true, wedged: false }).map(entryLabel)).toEqual([
      'The door to the east',
      'Close it',
      'Wedge it open with a spike',
    ]);
    expect(doorEntries(ctx, 'east', { open: true, wedged: true }).map(entryLabel)).toEqual([
      'The door to the east',
    ]);
  });

  it('lists every member to a referee', () => {
    const { ctx } = context('referee');
    const force = find(doorEntries(ctx, 'north', { open: false, wedged: false }), 'Force it open');
    expect(force?.type === 'submenu' && force.items).toHaveLength(4);
  });

  it('shows what the table learned about the door', () => {
    const { ctx } = context('player');
    const entries = doorEntries(
      ctx,
      'north',
      { open: false, wedged: false },
      { locked: true, heard: 'silence' },
    );
    expect(entryLabel(entries[1] ?? { type: 'separator' })).toBe('It is locked. It was quiet beyond it.');
  });
});

describe('doorLoreText', () => {
  it('names the members whose picks failed', () => {
    const party = context('player').ctx.view.party;
    expect(doorLoreText({ pickFailed: ['character-0002'] }, party)).toBe("Wren couldn't pick the lock.");
    expect(doorLoreText(undefined, party)).toBeNull();
  });
});

describe('searchEntries', () => {
  it('offers each kind of search with every living member, and sends the kind and the searcher', () => {
    const { ctx, run } = context('player');
    const entries = searchEntries(ctx);
    expect(entries.map(entryLabel)).toEqual([
      'Search for secret doors',
      'Search for room traps',
      'Search for construction tricks',
    ]);
    const traps = entries[1];
    if (traps?.type !== 'submenu') throw new Error('Expected a submenu.');
    expect(traps.items.map(entryLabel)).toEqual(['Brenna', 'Wren', 'Osric', 'Tamsin']);
    const first = traps.items[0];
    if (first?.type === undefined || first.type === 'item') first?.onSelect?.();
    expect(run).toHaveBeenCalledWith(
      { command_type: 'search', kind: 'room_traps', character_id: 'character-0001' },
      expect.anything(),
    );
  });
});

describe('cacheEntries', () => {
  const cache: SceneCache = {
    id: 'chest',
    source: 'authored',
    area_id: 'hall',
    position: null,
    reachable: true,
    trap: null,
  };

  it('takes a reachable cache, and lets a thief check it for traps', () => {
    const { ctx, run } = context('player');
    const entries = cacheEntries(ctx, cache, 'The treasure');
    expect(entries.map(entryLabel)).toEqual([
      'Take the treasure',
      'Give it all to one member',
      'Check it for traps: Wren',
    ]);
    select(entries, 'Take the treasure');
    expect(run).toHaveBeenCalledWith({ command_type: 'take_treasure', feature_id: 'chest' });
  });

  it('offers to disarm a found trap instead of checking again', () => {
    const { ctx } = context('player');
    const trapped: SceneCache = {
      ...cache,
      trap: { kind: 'treasure', trigger: 'open', state: 'found', area_id: 'hall', feature_id: 'chest' },
    };
    expect(cacheEntries(ctx, trapped, 'The treasure').map(entryLabel)).toContain('Disarm the trap: Wren');
  });

  it('offers nothing to take from a cache out of reach', () => {
    const { ctx } = context('player');
    expect(cacheEntries(ctx, { ...cache, reachable: false }, 'The treasure').map(entryLabel)).toEqual([
      'Check it for traps: Wren',
    ]);
  });
});

describe('lightEntries', () => {
  it('lights the torches the player’s members carry', () => {
    const { ctx, run } = context('player');
    const entries = lightEntries(ctx);
    expect(entries.map(entryLabel)).toEqual(['Brenna lights a torch']);
    select(entries, 'Brenna lights a torch');
    expect(run).toHaveBeenCalledWith(
      { command_type: 'light_source', character_id: 'character-0001', item_id: 'torch' },
      expect.anything(),
    );
  });
});

describe('transitions', () => {
  it('names the action and the way a transition leads', () => {
    expect(transitionAction({ kind: 'stairs_down', leads: 'down' })).toBe('Go down the stairs');
    expect(transitionDescription({ kind: 'stairs_up', leads: 'up' })).toBe('Stairs lead up.');
    expect(transitionDescription({ kind: 'chute', leads: 'down' })).toBe('A chute leads down.');
  });
});
