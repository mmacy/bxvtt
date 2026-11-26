/**
 * The one HTTP client of the app, and the text that turns a failed request into something a player can act on.
 *
 * Features never call `fetch`. They call a method of {@link getApi} (or a hook in `app/` that does), and pass
 * any error to {@link describeProblem} or {@link reportError}.
 */
import { BxvttClient, isProblem } from '@bxvtt/shared/client';
import { displayString, type Problem } from '@bxvtt/shared/protocol';
import { describeRejectionsText } from '@bxvtt/shared/text';
import { toast } from '@/ui';
import { toParamMap } from './params';

let client = new BxvttClient();

/** The shared {@link BxvttClient}. It sends the stored user token with every request. */
export function getApi(): BxvttClient {
  return client;
}

/**
 * Replaces the shared client. Tests call it with a fake; the app never does.
 *
 * @param next - The client to use from now on.
 */
export function setApi(next: BxvttClient): void {
  client = next;
}

/** A failed request, written for the player: what went wrong and what to do next. */
export interface ProblemMessage {
  /** One short sentence, for a toast title or a banner title. */
  title: string;
  /** What to do next, in one or two sentences. */
  detail: string;
  /** The stable problem code, for branching. Never show it. */
  code: string;
}

/** Whether an error is a network failure: the request never reached the server, or the answer wasn't JSON. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof SyntaxError;
}

const FIXED: Record<string, { title: string; detail: string }> = {
  bad_request: {
    title: "The server couldn't process that request",
    detail: 'Reload the page and try again.',
  },
  unauthorized: {
    title: 'Your sign-in expired',
    detail: 'Choose your name on the home page to continue.',
  },
  token_retired: {
    title: 'You signed in from another browser',
    detail:
      'A referee approved your rejoin request in another browser, which signed this browser out. Keep playing in that browser, or open the table invite link here and choose "I\'ve played at this table before".',
  },
  referee_required: { title: 'Only a referee can do that', detail: 'Ask the referee at your table.' },
  host_key_required: {
    title: 'Host key required to create a table',
    detail: 'Enter the host key from the server host.',
  },
  referee_command: { title: 'Only a referee can do that', detail: 'Ask the referee at your table.' },
  not_found: {
    title: 'That item is no longer here',
    detail: 'Someone might have removed it. Reload the page to get the latest table state.',
  },
  invite_invalid: {
    title: "That invite code isn't valid",
    detail: 'Check the link or code, or ask the referee for the current invite link.',
  },
  last_referee: {
    title: 'Every table must have at least one referee',
    detail: 'Make another member a referee before stepping down.',
  },
  game_active: {
    title: 'A game is in progress',
    detail: 'You cannot change lobby setup during play. Ask the referee to return to the lobby first.',
  },
  no_game: {
    title: 'No game is in progress',
    detail: 'Ask the referee to start a game from the lobby.',
  },
  duplicate_character: {
    title: 'That character is already in the party',
    detail: 'Choose a different character.',
  },
  roster_empty: {
    title: 'The party is empty',
    detail: 'Add at least one character before starting the game.',
  },
  revision_conflict: {
    title: 'The table changed',
    detail: 'Someone acted just before you. Check the updated table and try again.',
  },
  stale_version: {
    title: 'Someone else saved these notes first',
    detail: 'You are viewing their latest changes now. Apply your edit again.',
  },
  not_in_battle: {
    title: "The party isn't in battle",
    detail: 'You can declare actions only during a battle round.',
  },
  not_a_declarer: {
    title: "That character can't declare an action this round",
    detail: 'Choose a character who can act this round.',
  },
  declarations_incomplete: {
    title: 'Not everyone has declared an action',
    detail: 'Wait for every eligible character to declare, or ask the referee to resolve the round early.',
  },
  use_declarations: {
    title: 'Declare actions for the round first',
    detail: 'Declare an action for each character, then resolve the round.',
  },
  ability_roll_used: {
    title: 'You already used this ability roll',
    detail: 'Roll new ability scores to create another character.',
  },
  ability_roll_locked: {
    title: 'Your class is fixed for these ability scores',
    detail:
      'You rolled hit points for these ability scores, which fixed your class and the reroll option. To play another class, roll new ability scores.',
  },
  hit_points_not_rolled: {
    title: 'Roll your hit points first',
    detail: 'You roll your starting gold after your hit points.',
  },
  gold_not_rolled: {
    title: 'Roll your starting gold first',
    detail: 'Roll your starting gold so you know how much you can spend, then choose your equipment.',
  },
  version_unsupported: {
    title: 'This server does not support that file version',
    detail: 'Ask the server host to update the game service, or export the file in an older format.',
  },
  session_busy: { title: 'The table is busy', detail: 'Wait a moment and try again.' },
  adventure_read_only: {
    title: "Built-in adventures can't be deleted",
    detail: 'You can delete only adventures uploaded to this table.',
  },
  content_too_large: {
    title: 'That file or message is too large',
    detail: 'Adventure files can be up to 8 MB, while other requests can be up to 64 KB.',
  },
  unsupported_media_type: {
    title: 'Unsupported request format',
    detail: 'Reload the page and try again.',
  },
  validation_error: {
    title: 'Check what you entered',
    detail: "Names and labels can't contain control characters or text direction marks.",
  },
  unknown_command: {
    title: "That action isn't recognized",
    detail: 'Reload the page. The server might have been updated.',
  },
  party_invalid: {
    title: "These characters can't form a party",
    detail: 'Check the roster and try again.',
  },
  internal_error: {
    title: 'Something went wrong on the server',
    detail: 'Try again. If it keeps happening, contact the server host.',
  },
  bxapi_error: {
    title: 'The game server returned an unexpected response',
    detail: 'Try again. If it keeps happening, contact the server host.',
  },
  save_unreadable: {
    title: "This save can't be restored",
    detail:
      'The game was updated after this save was made, so it no longer loads. Restore a newer save, or start a new game from the lobby.',
  },
  bxapi_unavailable: {
    title: "Can't reach the game service",
    detail:
      "The server can't reach the game service. Ask the server host to start the game service, then try again.",
  },
  bxapi_outdated: {
    title: 'The game service is out of date',
    detail: "Games can't run until it's updated. Ask the server host to update the game service.",
  },
  bxapi_storage_full: {
    title: 'Server storage is full',
    detail:
      "You can't create characters, start games, make moves, or save until space is freed. A referee can delete unused tables and old saves, or ask the server host to raise the storage limit.",
  },
  method_not_allowed: {
    title: 'The server rejected that request method',
    detail: 'Reload the page. The server might have been updated.',
  },
  server_unavailable: {
    title: "The bxvtt server isn't responding",
    detail: 'It might be starting or restarting. Wait a few seconds and try again.',
  },
  invalid_response: {
    title: 'Received an unreadable response from the server',
    detail: 'Reload the page. If it keeps happening, check that this address points to your bxvtt server.',
  },
  character_invalid: {
    title: "Those character choices aren't valid",
    detail: 'Review your choices and try again.',
  },
  rejoin_member_online: {
    title: 'That member is at the table right now',
    detail:
      "You can't rejoin as someone who is currently online. If that's you in another browser, keep playing in that browser.",
  },
  rejoin_pending: {
    title: 'A rejoin request is already pending',
    detail:
      'Someone already asked to rejoin as this member. Try again after a referee responds or the request expires in a few minutes.',
  },
  rejoin_not_pending: {
    title: 'That rejoin request has ended',
    detail:
      'A referee responded, the request expired, or it was cancelled. Send a new rejoin request if you still need one.',
  },
  rejoin_no_approver: {
    title: 'No referee is available to approve this rejoin request',
    detail:
      "Referees can't approve their own rejoin requests. If you are the server host, open bxvtt at its local address on the host computer, where you are still signed in.",
  },
};

function describeKnownProblem(problem: Problem): ProblemMessage {
  const code = problem.code;
  if (code === 'rate_limited') {
    const seconds = problem.retry_after;
    return {
      code,
      title: 'Too many requests',
      detail:
        seconds === undefined
          ? 'Wait a moment and try again.'
          : `Wait ${seconds === 1 ? '1 second' : `${seconds} seconds`} and try again.`,
    };
  }
  if (code === 'character_invalid' && problem.rejections && problem.rejections.length > 0) {
    return {
      code,
      title: "Those character choices aren't valid",
      detail: describeRejectionsText(
        problem.rejections.map((r) => ({ code: r.code, params: toParamMap(r.params) })),
      ),
    };
  }
  // The server writes these details for a person: a seat check ("Only the player in Brenna's seat..."), a
  // quota ("You have 200 characters, the most this server keeps..."), or a full level of annotations.
  if (code === 'forbidden') {
    return { code, title: "You can't do that here", detail: problem.detail };
  }
  if (code === 'content_too_large' && /annotations/.test(problem.detail)) {
    return { code, title: 'Too many map marks on this level', detail: problem.detail };
  }
  if (code === 'content_invalid') {
    return { code, title: "That file isn't valid", detail: problem.detail };
  }
  const fixed = FIXED[code];
  if (fixed !== undefined) return { code, title: fixed.title, detail: fixed.detail };
  return {
    code,
    title: "That didn't work",
    detail: 'Try again. If it keeps happening, reload the page.',
  };
}

/**
 * Turns any error from an API call into a message for the player.
 *
 * @param error - The value from a `catch`.
 * @returns A title and a next step. The code is for branching only.
 */
export function describeProblem(error: unknown): ProblemMessage {
  if (isProblem(error)) return describeKnownProblem(error.problem);
  if (isNetworkError(error)) {
    return {
      code: 'network',
      title: "Can't reach the bxvtt server",
      detail: 'Check your connection, or ask the server host whether the server is running.',
    };
  }
  return {
    code: 'unknown',
    title: 'Something went wrong',
    detail: 'Try again. If it keeps happening, reload the page.',
  };
}

/**
 * Shows an error toast for a failed API call.
 *
 * @param error - The value from a `catch`.
 * @param options - `title` replaces the problem's title, such as "Couldn't save the game".
 * @returns The message that the toast showed.
 */
export function reportError(error: unknown, options: { title?: string } = {}): ProblemMessage {
  const message = describeProblem(error);
  toast.error(options.title ?? message.title, {
    description: options.title ? `${message.title}. ${message.detail}` : message.detail,
    id: `problem-${message.code}`,
  });
  return message;
}

/**
 * Checks a display string (a user name, table name, or save label) the way the server will, so a form can stop
 * the user before the server refuses it.
 *
 * @param value - The text the user typed.
 * @param max - The most characters it may have, such as `LIMITS.userName`.
 * @returns A sentence that explains the problem, or `null` when the text is fine.
 */
export function displayStringProblem(value: string, max: number): string | null {
  const text = value.trim();
  if (text === '') return 'Enter at least one character.';
  if ([...text].length > max) return `Use at most ${max} characters.`;
  if (!displayString(max).safeParse(text).success) {
    return "Remove the invisible characters. Names can't contain control characters or text direction marks.";
  }
  return null;
}
