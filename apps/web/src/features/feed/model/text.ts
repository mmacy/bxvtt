/**
 * Sentences for system notices and the times on feed entries.
 */
import type { SystemEntry } from '@bxvtt/shared/protocol';
import { lowerFirst, memberName, type TextContext } from '@bxvtt/shared/text';

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
    case 'member_rejoined':
      return `${actor} let ${subject} back into the table.`;
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
      return `${actor} ended the game and returned the table to the lobby.`;
    case 'save_created': {
      const label = param(entry, 'label');
      if (entry.params.autosave === true) {
        return label
          ? `Autosaved: ${lowerFirst(label.replace(AUTOSAVE_PREFIX, ''))}.`
          : 'Autosaved the game.';
      }
      // A label someone typed is a name, so it is quoted rather than run into the sentence.
      return label ? `${actor} saved the game as “${label}”.` : `${actor} saved the game.`;
    }
    case 'save_restored': {
      const label = param(entry, 'label');
      if (label === null) return `${actor} restored a save.`;
      return AUTOSAVE_PREFIX.test(label)
        ? `${actor} restored an autosave: ${lowerFirst(label.replace(AUTOSAVE_PREFIX, ''))}.`
        : `${actor} restored the save “${label}”.`;
    }
    case 'seat_changed': {
      const member = memberName(param(entry, 'member_id'), ctx);
      const userId = param(entry, 'user_id');
      return userId === null
        ? `${actor} cleared ${member}'s seat. The referee controls ${member} now.`
        : `${actor} gave ${member}'s seat to ${nameOf(userId)}.`;
    }
    case 'caller_changed':
      return param(entry, 'user_id') === null
        ? 'The party no longer has a caller.'
        : `${subject} is now the caller.`;
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
