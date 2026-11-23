import { describe, expect, it } from 'vitest';
import {
  commandModesSentence,
  sessionModeNow,
  sessionModeWhen,
  SESSION_MODE_ORDER,
  SESSION_MODE_VALUES,
} from './index';

describe('commandModesSentence', () => {
  it('says when a command works and what the party is doing instead', () => {
    expect(commandModesSentence('search', ['exploring'], 'town')).toBe(
      'You can search only while exploring. The party is in town now.',
    );
    expect(commandModesSentence('end_encounter', ['encounter'], 'battle')).toBe(
      'You can end the encounter only during an encounter. The party is in a battle now.',
    );
  });

  it('lists several modes in the order a game passes through them', () => {
    // bxapi sorts allowed_modes alphabetically.
    expect(commandModesSentence('rest', ['exploring', 'town'], 'encounter')).toBe(
      'You can rest the party only in town or while exploring. The party is in an encounter now.',
    );
    expect(commandModesSentence('wait', ['battle', 'encounter', 'exploring'], 'town')).toBe(
      'You can wait only while exploring, during an encounter, or during a battle. The party is in town now.',
    );
  });

  it('leaves out the party when the mode is unknown or already allowed', () => {
    expect(commandModesSentence('search', ['exploring'])).toBe('You can search only while exploring.');
    expect(commandModesSentence('search', ['exploring'], 'exploring')).toBe(
      'You can search only while exploring.',
    );
  });

  it('handles a command that no mode allows, and a command or mode it has no text for', () => {
    expect(commandModesSentence('search', [], 'town')).toBe("You can't search at any point in the game.");
    expect(commandModesSentence('polish_boots', ['siege'], 'victory')).toBe(
      'You can polish boots only in siege mode. The party has won the adventure now.',
    );
  });

  it('has phrases for every session mode', () => {
    expect([...SESSION_MODE_ORDER].sort()).toEqual([...SESSION_MODE_VALUES].sort());
    for (const mode of SESSION_MODE_VALUES) {
      expect(sessionModeWhen(mode)).not.toMatch(/mode$/);
      expect(sessionModeNow(mode)).toMatch(/^(is|has) /);
    }
  });
});
