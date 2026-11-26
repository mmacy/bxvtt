import { emptyContext } from '@bxvtt/shared/text';
import { describe, expect, it, vi } from 'vitest';
import { canSendCommand, partyHere, type HereFeature, type PermissionContext } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { hereFeature, pileView } from '@/app/testing/views';
import type { MenuEntry } from '@/ui';
import {
  cacheEntries,
  cacheMoreEntries,
  cacheSnippet,
  cacheTakeEntry,
  doorEntries,
  doorLoreText,
  entryLabel,
  lightEntries,
  lightUnavailableReason,
  searchEntries,
  transitionAction,
  transitionDescription,
  treasureEntries,
  treasureMenuLabel,
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
    here: partyHere(game.view),
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
      'Door to the north',
      'Open door',
      'Force door',
      'Pick lock: Wren',
      'Listen at door',
      'Wedge shut with a spike',
    ]);
    const force = find(entries, 'Force door');
    expect(force?.type === 'submenu' && force.items.map(entryLabel)).toEqual([
      'Brenna (1 in 6)',
      'Wren (2 in 6)',
    ]);
    select(entries, 'Pick lock: Wren');
    expect(run).toHaveBeenCalledWith(
      { command_type: 'pick_lock', direction: 'north', character_id: 'character-0002' },
      expect.objectContaining({ nothingText: expect.stringContaining('Wren') }),
    );
  });

  it('offers to close an open door, and nothing to close when it is wedged', () => {
    const { ctx } = context('player');
    expect(doorEntries(ctx, 'east', { open: true, wedged: false }).map(entryLabel)).toEqual([
      'Door to the east',
      'Close door',
      'Wedge open with a spike',
    ]);
    expect(doorEntries(ctx, 'east', { open: true, wedged: true }).map(entryLabel)).toEqual([
      'Door to the east',
    ]);
  });

  it('lists every member to a referee', () => {
    const { ctx } = context('referee');
    const force = find(doorEntries(ctx, 'north', { open: false, wedged: false }), 'Force door');
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
    expect(entryLabel(entries[1] ?? { type: 'separator' })).toBe(
      'The door is locked. No sound came from beyond the door.',
    );
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
  const cache = hereFeature({ id: 'feature:chest', description: 'An iron-bound chest.', areaId: 'hall' });

  it('takes a cache in reach, and lets a thief check it for traps', () => {
    const { ctx, run } = context('player');
    const entries = cacheEntries(ctx, cache);
    expect(entries.map(entryLabel)).toEqual(['Take', 'Give all to one member', 'Check for traps: Wren']);
    select(entries, 'Take');
    expect(run).toHaveBeenCalledWith({ command_type: 'take_treasure', feature_id: 'feature:chest' });
  });

  it('offers to take anyway, or to disarm, a cache whose trap the party found', () => {
    const { ctx } = context('player');
    const trapped: HereFeature = { ...cache, trapState: 'found' };
    expect(cacheEntries(ctx, trapped).map(entryLabel)).toEqual([
      'Take anyway',
      'Give all to one member',
      'Disarm trap: Wren',
    ]);
  });

  it('offers nothing for a cache out of reach or emptied, because bxapi accepts none of the commands for it', () => {
    const { ctx } = context('player');
    expect(cacheEntries(ctx, { ...cache, inReach: false })).toEqual([]);
    expect(cacheEntries(ctx, { ...cache, emptied: true })).toEqual([]);
  });

  it('keeps taking apart from the other actions, which the scene panel puts under More', () => {
    const { ctx } = context('player');
    expect(cacheTakeEntry(ctx, cache)).toMatchObject({ label: 'Take' });
    expect(cacheTakeEntry(ctx, { ...cache, inReach: false })).toBeNull();
    expect(cacheMoreEntries(ctx, cache).map(entryLabel)).toEqual([
      'Give all to one member',
      'Check for traps: Wren',
    ]);
  });

  it('offers no trap action once the trap has sprung or been disarmed', () => {
    const { ctx } = context('player');
    expect(cacheMoreEntries(ctx, { ...cache, trapState: 'sprung' }).map(entryLabel)).toEqual([
      'Give all to one member',
    ]);
  });
});

describe('cacheSnippet', () => {
  it('names a treasure by the start of its description', () => {
    expect(cacheSnippet({ description: 'An iron-bound chest.' })).toBe('An iron-bound chest.');
    expect(cacheSnippet({ description: 'A casket of silver and crystal, its lid inlaid with pearl.' })).toBe(
      'A casket of silver and crystal, its lid…',
    );
    expect(cacheSnippet({ description: '' })).toBeNull();
  });
});

describe('treasureEntries', () => {
  it('names the treasure and the dropped goods when both lie here, with the scene panel’s verbs', () => {
    const { ctx } = context('player');
    const here = ctx.here;
    if (!here) throw new Error('The party is in town.');
    const chest = hereFeature({ id: 'feature:chest' });
    here.caches = [chest, { ...chest, id: 'feature:emptied', emptied: true }];
    here.pile = pileView();
    const labels = treasureEntries(ctx).map(entryLabel);
    expect(labels).toEqual(
      expect.arrayContaining(['Treasure', 'Take', 'Dropped goods', 'Pick up dropped goods']),
    );
    // The emptied cache offers nothing, so the one left needs no number.
    expect(labels).not.toContain('Treasure 2');
    expect(treasureMenuLabel(here)).toBe('Treasure and dropped goods');
    here.caches = [{ ...chest, emptied: true }];
    expect(treasureEntries(ctx).map(entryLabel)).toEqual(['Pick up dropped goods']);
    expect(treasureMenuLabel(here)).toBe('Dropped goods');
  });

  it('names each treasure by its description when several lie here', () => {
    const { ctx } = context('player');
    const here = ctx.here;
    if (!here) throw new Error('The party is in town.');
    const chest = hereFeature({ id: 'feature:chest', description: 'An iron-bound chest.' });
    here.caches = [chest, { ...chest, id: 'feature:satchel', description: 'A rotted satchel.' }];
    here.pile = null;
    const labels = treasureEntries(ctx).map(entryLabel);
    expect(labels).toEqual(expect.arrayContaining(['An iron-bound chest.', 'A rotted satchel.']));
    expect(labels.filter((label) => label.startsWith('Treasure'))).toEqual([]);
  });

  it('numbers the rolled treasures, and leaves out the treasures out of reach', () => {
    const { ctx } = context('player');
    const here = ctx.here;
    if (!here) throw new Error('The party is in town.');
    here.caches = [
      hereFeature({ id: 'feature:far', inReach: false }),
      hereFeature({ id: 'feature:hoard' }),
      hereFeature({ id: 'feature:chest', description: 'An iron-bound chest.' }),
    ];
    here.pile = null;
    const labels = treasureEntries(ctx).map(entryLabel);
    expect(labels.filter((label) => label.startsWith('Treasure') || label.startsWith('An '))).toEqual([
      'Treasure 2',
      'An iron-bound chest.',
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

describe('lightUnavailableReason', () => {
  it('says no one has a light when no living member carries or burns one', () => {
    const { ctx } = context('player');
    const empty = { ...ctx, view: { ...ctx.view, party: [], effects: [] } };
    expect(lightUnavailableReason(empty, () => ({ allowed: true, reason: null }))).toBe(
      'No one in the party carries a torch or lantern.',
    );
  });

  it('gives the permission’s reason when a member holds a light the viewer may not use', () => {
    const { ctx } = context('player');
    const reason = 'Only Ruth, who plays Brenna, can have Brenna light a torch or lantern.';
    const seen: string[] = [];
    const text = lightUnavailableReason(ctx, (memberId) => {
      seen.push(memberId);
      return { allowed: false, reason };
    });
    expect(text).toBe(reason);
    expect(seen).toContain('character-0001');
  });
});

describe('transitions', () => {
  it('names the action and the transition from its kind', () => {
    expect(transitionAction({ kind: 'stairs_down' })).toBe('Go down the stairs');
    expect(transitionDescription({ kind: 'stairs_up' })).toBe('Stairs lead up.');
    expect(transitionDescription({ kind: 'chute' })).toBe('A chute slopes down into the dark.');
    expect(transitionDescription({ kind: 'trapdoor' })).toBe("There's a trapdoor here.");
  });
});
