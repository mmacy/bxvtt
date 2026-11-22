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
    title: "The server couldn't read that request",
    detail: 'Reload the page and try again.',
  },
  unauthorized: {
    title: "This server doesn't know your name anymore",
    detail: 'Pick a name again on the home page to continue.',
  },
  token_retired: {
    title: "You've signed in from another browser",
    detail:
      "A referee let you back in at a table from another browser, so this browser's sign-in stopped working. Play on there, or open the table's invite link here and choose \"I've played at this table before\".",
  },
  referee_required: { title: 'Only a referee can do that', detail: 'Ask the referee at your table.' },
  host_key_required: {
    title: 'Creating a table here needs the host key',
    detail: 'Enter the host key that the person running this server gave you.',
  },
  referee_command: { title: 'Only a referee can do that', detail: 'Ask the referee at your table.' },
  not_found: {
    title: "That isn't here anymore",
    detail: 'Someone may have removed it. Reload the page to see the table as it is now.',
  },
  invite_invalid: {
    title: "That invite code doesn't match a table",
    detail: 'Check the code, or ask the referee for a new invite link.',
  },
  last_referee: {
    title: 'The table needs a referee',
    detail: 'Make another member a referee first.',
  },
  game_active: {
    title: 'The game is running',
    detail: 'The lobby is locked while you play. The referee can end the game to change it.',
  },
  no_game: { title: 'No game is running', detail: 'The referee starts one from the lobby.' },
  duplicate_character: {
    title: 'That character is already in the party',
    detail: 'Pick a different character.',
  },
  roster_empty: {
    title: 'The party is empty',
    detail: 'Add at least one character before you start the game.',
  },
  revision_conflict: {
    title: 'The table changed',
    detail: 'Someone acted before you did. Look at the new state and choose again.',
  },
  stale_version: {
    title: 'Someone else saved these notes first',
    detail: 'Their version is showing now. Make your change again.',
  },
  not_in_battle: {
    title: "The party isn't in a battle",
    detail: 'Declarations apply only during a battle round.',
  },
  not_a_declarer: {
    title: "That character doesn't declare this round",
    detail: "They can't act in this round.",
  },
  declarations_incomplete: {
    title: 'Some characters still need to declare',
    detail: 'The round resolves when every character has declared. A referee can resolve it early.',
  },
  use_declarations: {
    title: 'Battle rounds resolve from declarations',
    detail: 'Declare an action for each character instead.',
  },
  ability_roll_used: {
    title: 'Those ability scores already made a character',
    detail: 'Roll new ability scores to make another.',
  },
  version_unsupported: {
    title: 'That document is newer than this server',
    detail: 'Ask the host to update bxapi, or export the document for an older version.',
  },
  session_busy: { title: 'The table is busy', detail: 'Wait a moment and try again.' },
  adventure_read_only: {
    title: 'Built-in adventures stay',
    detail: 'You can delete only an adventure that your table uploaded.',
  },
  content_too_large: {
    title: 'That is too large to send',
    detail: 'An adventure document can be up to 8 MB. Other requests can be up to 64 KB.',
  },
  unsupported_media_type: {
    title: "The server couldn't read that request",
    detail: 'Reload the page and try again.',
  },
  validation_error: {
    title: "Something in that request isn't right",
    detail:
      "Check what you entered. Names and labels can't contain control characters or text direction marks.",
  },
  unknown_command: {
    title: "The rules engine doesn't know that action",
    detail: 'Reload the page. The server may have been updated.',
  },
  party_invalid: {
    title: "These characters can't form a party",
    detail: 'Check the roster and try again.',
  },
  internal_error: {
    title: 'Something went wrong on the server',
    detail: 'Try again. If it keeps happening, tell the person who runs this server.',
  },
  bxapi_error: {
    title: 'The rules engine gave an unexpected answer',
    detail: 'Try again. If it keeps happening, tell the person who runs this server.',
  },
  bxapi_unavailable: {
    title: "The rules engine isn't answering",
    detail: "bxvtt can't reach bxapi. Ask the person who runs this server to start it, then try again.",
  },
  method_not_allowed: {
    title: "The server doesn't take that request",
    detail: 'Reload the page. The server may have been updated.',
  },
  server_unavailable: {
    title: "The bxvtt server isn't answering",
    detail: 'It may be starting or restarting. Wait a few seconds and try again.',
  },
  invalid_response: {
    title: "The server's answer couldn't be read",
    detail: 'Reload the page. If it keeps happening, check that the address points at your bxvtt server.',
  },
  target_unknown: {
    title: "That target isn't there anymore",
    detail: 'The situation changed. Choose a target again.',
  },
  character_invalid: {
    title: 'That character breaks a rule',
    detail: "Check the character's choices and try again.",
  },
  rejoin_member_online: {
    title: 'That member is at the table right now',
    detail: "Nobody needs to come back in as them. If that's you in another browser, keep playing there.",
  },
  rejoin_pending: {
    title: 'A request to come back in is already waiting',
    detail:
      'Someone already asked to come back in as this member. Ask again after a referee answers it or it ends, in a few minutes at most.',
  },
  rejoin_not_pending: {
    title: 'That request has ended',
    detail: 'A referee answered it, it ran out of time, or it was cancelled. Ask again if you still need to.',
  },
  rejoin_no_approver: {
    title: 'No referee can let this member back in',
    detail:
      "A referee can't approve their own request. If you run this server, open it on the host computer at its local address, where your sign-in still works.",
  },
};

function describeKnownProblem(problem: Problem): ProblemMessage {
  const code = problem.code;
  if (code === 'rate_limited') {
    const seconds = problem.retry_after;
    return {
      code,
      title: 'That was a lot in a short time',
      detail:
        seconds === undefined
          ? 'The server slows down busy clients. Wait a moment and try again.'
          : `The server slows down busy clients. Wait ${seconds === 1 ? 'a second' : `${seconds} seconds`} and try again.`,
    };
  }
  if (code === 'character_invalid' && problem.rejections && problem.rejections.length > 0) {
    return {
      code,
      title: 'That character breaks a rule',
      detail: describeRejectionsText(
        problem.rejections.map((r) => ({ code: r.code, params: toParamMap(r.params) })),
      ),
    };
  }
  // The server writes these details for a person: a seat check ("Only the player in Brenna's seat..."), a
  // quota ("You have 200 characters, the most this server keeps..."), or a full level of annotations.
  if (code === 'forbidden') {
    return { code, title: "That isn't allowed here", detail: problem.detail };
  }
  if (code === 'content_too_large' && /annotations/.test(problem.detail)) {
    return { code, title: 'The map is full of marks', detail: problem.detail };
  }
  if (code === 'content_invalid') {
    return { code, title: "That document isn't valid", detail: problem.detail };
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
      detail: 'Check your connection, or ask the person who runs the server whether it is up.',
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
