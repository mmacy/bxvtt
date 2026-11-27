import { beforeEach, describe, expect, it } from 'vitest';
import { displayStringIssue, displayStringProblem } from './api';
import { useMapBus } from './mapBus';
import { formatShortcut, matchesShortcut } from './shortcuts';

function key(init: KeyboardEventInit & { key: string; code?: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('map interaction bus', () => {
  beforeEach(() => useMapBus.getState().reset());

  it('resolves a pick with the target the map reports', async () => {
    const picked = useMapBus
      .getState()
      .requestPick({ kind: 'cell', prompt: 'Pick the cell to place the party on.' });
    expect(useMapBus.getState().pick).toMatchObject({ kind: 'cell' });
    useMapBus
      .getState()
      .fulfilPick({ kind: 'edge', dungeon_id: 'priory', level_number: 1, x: 1, y: 1, direction: 'north' });
    expect(useMapBus.getState().pick).not.toBeNull();
    useMapBus.getState().fulfilPick({ kind: 'cell', dungeon_id: 'priory', level_number: 1, x: 4, y: 7 });
    await expect(picked).resolves.toEqual({
      kind: 'cell',
      dungeon_id: 'priory',
      level_number: 1,
      x: 4,
      y: 7,
    });
    expect(useMapBus.getState().pick).toBeNull();
  });

  it('resolves to null on cancel, and when a new request replaces the open one', async () => {
    const first = useMapBus.getState().requestPick({ kind: 'edge', prompt: 'Pick a door.' });
    const second = useMapBus.getState().requestPick({ kind: 'cell', prompt: 'Pick a cell.' });
    await expect(first).resolves.toBeNull();
    useMapBus.getState().cancelPick();
    await expect(second).resolves.toBeNull();
  });

  it('keeps one focus request until the map clears it', () => {
    useMapBus.getState().requestFocus({ kind: 'member', memberId: 'character-0002' });
    const focus = useMapBus.getState().focus;
    expect(focus?.target).toEqual({ kind: 'member', memberId: 'character-0002' });
    useMapBus.getState().clearFocus(focus?.id ?? -1);
    expect(useMapBus.getState().focus).toBeNull();
  });
});

describe('shortcuts', () => {
  it('matches keys with their modifiers', () => {
    expect(matchesShortcut('s', key({ key: 's', code: 'KeyS' }), false)).toBe(true);
    expect(matchesShortcut('s', key({ key: 's', code: 'KeyS', ctrlKey: true }), false)).toBe(false);
    expect(matchesShortcut('mod+k', key({ key: 'k', code: 'KeyK', ctrlKey: true }), false)).toBe(true);
    expect(matchesShortcut('mod+k', key({ key: 'k', code: 'KeyK', metaKey: true }), true)).toBe(true);
    expect(matchesShortcut('shift+l', key({ key: 'L', code: 'KeyL', shiftKey: true }), false)).toBe(true);
    expect(matchesShortcut('?', key({ key: '?', code: 'Slash', shiftKey: true }), false)).toBe(true);
    // Alt changes the character a Mac types, so letters and digits match by their key code.
    expect(matchesShortcut('alt+1', key({ key: '¡', code: 'Digit1', altKey: true }), true)).toBe(true);
  });

  it('formats keys for the platform', () => {
    expect(formatShortcut('mod+k', false)).toEqual(['Ctrl', 'K']);
    expect(formatShortcut('mod+k', true)).toEqual(['⌘', 'K']);
    expect(formatShortcut('shift+arrowup', false)).toEqual(['Shift', '↑']);
  });
});

describe('displayStringIssue', () => {
  it('names the rule a display string breaks, so a form can word it', () => {
    expect(displayStringIssue('Rhea', 40)).toBeNull();
    expect(displayStringIssue('   ', 40)).toBe('empty');
    expect(displayStringIssue('x'.repeat(41), 40)).toBe('too_long');
    expect(displayStringIssue('Rh\tea', 40)).toBe('invisible');
  });
});

describe('displayStringProblem', () => {
  it('stops names the server refuses', () => {
    expect(displayStringProblem('Rhea', 40)).toBeNull();
    expect(displayStringProblem('   ', 40)).toBe('Enter at least one character.');
    expect(displayStringProblem('x'.repeat(41), 40)).toBe('Use at most 40 characters.');
    expect(displayStringProblem('Rhea‮aehr', 40)).toMatch(/text direction marks/);
  });
});
