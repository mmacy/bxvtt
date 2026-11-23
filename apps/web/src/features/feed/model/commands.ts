/**
 * Reads what a user typed in the composer: a chat message, a dice roll, a whisper, or a request for help. The
 * server parses `/roll` again and rolls with bxapi. This module catches a typo before the request goes out and
 * turns `/w` into the recipients of a whisper.
 */
import { LIMITS, parseRollCommand } from '@bxvtt/shared/protocol';
import { parseDiceExpression } from './dice';

/** A member the composer can whisper to. */
export interface Recipient {
  user_id: string;
  name: string;
  role: 'referee' | 'player';
}

/** What the composer should do with the text. */
export type ComposerIntent =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'chat'; text: string }
  | { kind: 'roll'; text: string; expression: string; secret: boolean }
  | { kind: 'whisper'; text: string; to: string[]; names: string[] }
  | { kind: 'error'; message: string };

/** One slash command, for the list the composer shows when you type `/`. */
export interface SlashCommand {
  /** What to insert when the user picks it. */
  insert: string;
  /** The usage, as the list shows it. */
  usage: string;
  description: string;
  refereeOnly?: boolean;
}

/** The commands the composer understands. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { insert: '/roll ', usage: '/roll 2d6+1 for damage', description: 'Roll dice. /r is short for /roll.' },
  {
    insert: '/roll secret ',
    usage: '/roll secret 1d20',
    description: 'Roll so only referees see the result.',
    refereeOnly: true,
  },
  { insert: '/w ', usage: '/w Ruth message', description: 'Whisper to a table member or all referees.' },
  { insert: '/help', usage: '/help', description: 'Show these commands.' },
];

/**
 * The slash commands that match what the user has typed so far, or an empty list when the text isn't the start
 * of a command.
 *
 * @param text - The composer text.
 * @param referee - Whether the user is a referee.
 */
export function matchSlashCommands(text: string, referee: boolean): SlashCommand[] {
  if (!text.startsWith('/') || /\s/.test(text.trimEnd()) || text.includes('\n')) return [];
  const typed = text.trim().toLowerCase();
  return SLASH_COMMANDS.filter((command) => {
    if (command.refereeOnly && !referee) return false;
    const word = command.insert.trim().split(' ')[0] ?? '';
    return word.startsWith(typed) || (typed === '/r' && word === '/roll');
  });
}

/**
 * Finds whom `/w` names. It matches the longest member name at the start of `rest`, ignoring case, so a name with
 * spaces works. `referees` (or `referee`) names every referee.
 *
 * @returns The recipients and the message after the name, or `null` when no member matches.
 */
export function resolveWhisper(
  rest: string,
  recipients: readonly Recipient[],
  selfId: string | null,
): { to: Recipient[]; message: string } | null {
  const lower = rest.toLowerCase();
  const keyword = /^(referees|referee)(\s|$)/i.exec(rest);
  if (keyword) {
    const to = recipients.filter((r) => r.role === 'referee' && r.user_id !== selfId);
    return { to, message: rest.slice(keyword[0].length).trim() };
  }
  const sorted = [...recipients]
    .filter((r) => r.user_id !== selfId)
    .sort((a, b) => b.name.length - a.name.length);
  for (const recipient of sorted) {
    const name = recipient.name.toLowerCase();
    if (lower.startsWith(name) && (lower.length === name.length || /\s/.test(lower[name.length] ?? ''))) {
      return { to: [recipient], message: rest.slice(name.length).trim() };
    }
  }
  return null;
}

/**
 * Reads the composer text.
 *
 * @param text - What the user typed.
 * @param options - Who the user can whisper to, the user's ID, and whether the user is a referee.
 */
export function parseComposer(
  text: string,
  options: { recipients: readonly Recipient[]; selfId: string | null; referee: boolean },
): ComposerIntent {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (trimmed.length > LIMITS.feedText) {
    return {
      kind: 'error',
      message: `A message can have at most ${LIMITS.feedText.toLocaleString()} characters. Shorten it by ${(trimmed.length - LIMITS.feedText).toLocaleString()}.`,
    };
  }
  if (!trimmed.startsWith('/')) return { kind: 'chat', text: trimmed };

  const [word = ''] = trimmed.split(/\s/, 1);
  const command = word.toLowerCase();
  const rest = trimmed.slice(word.length).trim();

  if (command === '/help' || command === '/?') return { kind: 'help' };

  if (command === '/roll' || command === '/r') {
    const roll = parseRollCommand(trimmed);
    if (roll === null) {
      return { kind: 'error', message: 'Enter dice after /roll, for example /roll 2d6+1 for damage.' };
    }
    if (parseDiceExpression(roll.expression) === null) {
      return {
        kind: 'error',
        message: `"${roll.expression}" isn't a valid dice roll. Use one die type with an optional count and modifier, such as 2d6+1, d20, or d%.`,
      };
    }
    if (roll.secret && !options.referee) {
      return {
        kind: 'error',
        message: 'Only referees can roll in secret. Remove "secret" to roll openly.',
      };
    }
    return { kind: 'roll', text: trimmed, expression: roll.expression, secret: roll.secret };
  }

  if (command === '/w' || command === '/whisper') {
    if (rest === '') return { kind: 'error', message: 'Enter a member name and message after /w.' };
    const resolved = resolveWhisper(rest, options.recipients, options.selfId);
    if (resolved === null) {
      return {
        kind: 'error',
        message:
          'No one at the table has that name. Check the spelling or choose someone from the whisper menu.',
      };
    }
    if (resolved.to.length === 0)
      return { kind: 'error', message: 'There are no other referees to whisper to.' };
    if (resolved.message === '') return { kind: 'error', message: 'Write the message after the name.' };
    return {
      kind: 'whisper',
      text: resolved.message,
      to: resolved.to.map((r) => r.user_id),
      names: resolved.to.map((r) => r.name),
    };
  }

  return { kind: 'error', message: `Unknown command ${word}. Type / to see available commands.` };
}
