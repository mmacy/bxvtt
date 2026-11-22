/**
 * Sentences for system notices and the times on feed entries.
 */
import type { SystemEntry } from '@bxvtt/shared/protocol';
import { memberName, type TextContext } from '@bxvtt/shared/text';

/** Names a user, or says the user left the table. */
export type NameOf = (userId: string | null | undefined) => string;

const AUTOSAVE_PREFIX = /^Autosave:\s*/;

function param(entry: SystemEntry, key: string): string | null {
  const value = entry.params[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * The sentence for a system notice, such as "Ruth saved the game: Before the crypt."
 *
 * @param entry - The notice.
 * @param nameOf - Names a user by ID.
 * @param ctx - The text context, to name a party member.
 */
export function systemSentence(entry: SystemEntry, nameOf: NameOf, ctx: TextContext): string {
  const actor = nameOf(entry.user_id);
  const subject = nameOf(param(entry, 'user_id'));
  switch (entry.code) {
    case 'member_joined':
      return `${subject} joined the table.`;
    case 'member_left':
      return `${subject} left the table.`;
    case 'member_removed':
      return `${actor} removed ${subject} from the table.`;
    case 'role_changed':
      return param(entry, 'role') === 'referee'
        ? `${actor} made ${subject} a referee.`
        : `${actor} made ${subject} a player.`;
    case 'game_started': {
      const name = param(entry, 'adventure_name');
      return name ? `${actor} started ${name}.` : `${actor} started the game.`;
    }
    case 'game_ended':
      return `${actor} ended the game, and the table is back in its lobby.`;
    case 'save_created': {
      const label = param(entry, 'label');
      if (entry.params.autosave === true) {
        return label ? `Autosaved: ${label.replace(AUTOSAVE_PREFIX, '')}.` : 'The server saved the game.';
      }
      return label ? `${actor} saved the game: ${label}.` : `${actor} saved the game.`;
    }
    case 'save_restored': {
      const label = param(entry, 'label');
      return label
        ? `${actor} restored a save: ${label.replace(AUTOSAVE_PREFIX, '')}.`
        : `${actor} restored a save.`;
    }
    case 'seat_changed': {
      const member = memberName(param(entry, 'member_id'), ctx);
      const userId = param(entry, 'user_id');
      return userId === null
        ? `${actor} emptied ${member}'s seat, so the referees play ${member} now.`
        : `${actor} gave ${member}'s seat to ${nameOf(userId)}.`;
    }
    case 'caller_changed':
      return param(entry, 'user_id') === null
        ? 'The party has no caller now.'
        : `${subject} is the caller now and speaks for the party.`;
    case 'adventure_uploaded': {
      const name = param(entry, 'name');
      return name ? `${actor} uploaded the adventure ${name}.` : `${actor} uploaded an adventure.`;
    }
  }
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' });

/** The time of an entry, such as "9:41 PM". */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date);
}

/** The date and time of an entry, for a tooltip. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : fullFormat.format(date);
}
