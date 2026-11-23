/**
 * Who may send what, mirrored from the server so the interface can enable and disable controls. The server
 * stays the authority and checks every request again. These functions only read the game state and table
 * settings: they never decide whether an action is legal under the rules, which is bxapi's job, and they
 * read legality from `game.commands`.
 *
 * The rules (`apps/server/README.md`, "Who may do what"):
 *
 * - A `member` command: the user in the acting member's seat, or a referee. A referee controls empty seats.
 * - A `party` command: a referee or the caller. With `party_control: "anyone"`, any member with a seat.
 * - A `referee` command: a referee, and in this client only while the referee lens is on.
 * - `resolve_battle_round` (`battle`): nobody. Battle actions go through declarations.
 * - A declaration: the user in the member's seat, or a referee.
 * - Resolving a round: whoever may send party commands. Resolving early is for referees.
 */
import type { GameState, Role, TableSettings } from '@bxvtt/shared/protocol';
import { commandInfo, commandModesSentence, sessionModeNow } from '@bxvtt/shared/text';

/** A command's entry in bxapi's command catalog, as far as the permission checks read it. */
export interface CatalogCommand {
  command_type: string;
  kind: string;
  allowed_modes: readonly string[];
}

/** What a permission check reads. Build it with `usePermissionContext`. */
export interface PermissionContext {
  userId: string | null;
  role: Role | null;
  /** Whether the referee lens is on. It matters only for referee commands. */
  lens: boolean;
  game: GameState | null;
  settings: TableSettings | null;
  /** The people at the table, so a reason can name the caller or the player in a seat. */
  members?: readonly { user_id: string; name: string }[];
  /** bxapi's command catalog, so a reason can say in which modes a command works. `null` while it loads. */
  catalog?: readonly CatalogCommand[] | null;
}

/** The answer of a permission check, with a sentence for a disabled control's reason when it is `false`. */
export type Permission = { allowed: true; reason: null } | { allowed: false; reason: string };

const ALLOWED: Permission = { allowed: true, reason: null };

/** Where a referee changes who plays whom and who the caller is, for the second sentence of a reason. */
const SEATS = 'A referee can change this under Seats and caller.';

function deny(reason: string): Permission {
  return { allowed: false, reason };
}

const NO_GAME = deny('No game is running. A referee starts one from the lobby.');

function memberName(ctx: PermissionContext, memberId: string): string {
  return (
    ctx.game?.seats.find((seat) => seat.member_id === memberId)?.name ??
    ctx.game?.view.party.find((member) => member.id === memberId)?.name ??
    'that character'
  );
}

function userName(ctx: PermissionContext, userId: string): string | null {
  return ctx.members?.find((member) => member.user_id === userId)?.name ?? null;
}

/** Whether the user is a referee of the table. */
export function isReferee(ctx: PermissionContext): boolean {
  return ctx.role === 'referee';
}

/** The party member IDs in the user's seats. A referee's list doesn't include empty seats. */
export function seatedMemberIds(ctx: PermissionContext): string[] {
  if (ctx.game === null || ctx.userId === null) return [];
  return ctx.game.seats.filter((seat) => seat.user_id === ctx.userId).map((seat) => seat.member_id);
}

/**
 * Whether the user may act for one party member: they sit in the member's seat, or they are a referee.
 *
 * @param ctx - The permission context.
 * @param memberId - The party member, such as `character-0001`.
 * @param phrase - The action as an infinitive phrase from the text catalog, such as `cast a spell`, so the reason
 *   can name it. Without it, the reason says "act for" the member.
 */
export function canControlMember(ctx: PermissionContext, memberId: string, phrase?: string): Permission {
  const game = ctx.game;
  if (game === null) return NO_GAME;
  if (isReferee(ctx)) return ALLOWED;
  const seat = game.seats.find((candidate) => candidate.member_id === memberId);
  if (seat !== undefined && seat.user_id !== null && seat.user_id === ctx.userId) return ALLOWED;
  const name = memberName(ctx, memberId);
  const action = phrase === undefined ? `act for ${name}` : `have ${name} ${phrase}`;
  if (seat === undefined || seat.user_id === null) {
    return deny(`Nobody plays ${name}, so only a referee can ${action}. ${SEATS}`);
  }
  const player = userName(ctx, seat.user_id);
  if (player === null) return deny(`Another player plays ${name}, so only they can ${action}. ${SEATS}`);
  return deny(`Only ${player}, who plays ${name}, can ${action}. ${SEATS}`);
}

/**
 * Whether the user may act for the whole party: a referee, the caller, or a seated member when anyone may.
 *
 * @param ctx - The permission context.
 * @param phrase - The action as an infinitive phrase from the text catalog, such as `rest`, so the reason can
 *   name it. Without it, the reason says "act for the party".
 */
export function canActForParty(ctx: PermissionContext, phrase = 'act for the party'): Permission {
  const game = ctx.game;
  if (game === null) return NO_GAME;
  if (isReferee(ctx)) return ALLOWED;
  // The table setting decides, as on the server. `null` there means no caller.
  const callerId = ctx.settings !== null ? ctx.settings.caller_user_id : game.caller_user_id;
  if (callerId !== null && callerId === ctx.userId) return ALLOWED;
  if (ctx.settings?.party_control === 'anyone') {
    if (seatedMemberIds(ctx).length > 0) return ALLOWED;
    return deny(`Only players with a character in the party can ${phrase}. ${SEATS}`);
  }
  if (callerId === null) {
    return deny(`The party has no caller, so only a referee can ${phrase}. ${SEATS}`);
  }
  const caller = userName(ctx, callerId);
  return deny(
    caller === null
      ? `Only the caller can ${phrase}. ${SEATS}`
      : `Only the caller can ${phrase}. ${caller} is the caller.`,
  );
}

/** Why a command that isn't in `game.commands` can't be sent, from the command catalog when it has loaded. */
function notLegal(ctx: PermissionContext, game: GameState, commandType: string): Permission {
  if (game.ended)
    return deny('The game has ended. A referee can return the table to the lobby to start again.');
  const phrase = commandInfo(commandType).phrase;
  const entry = ctx.catalog?.find((command) => command.command_type === commandType);
  if (entry !== undefined) {
    if (entry.kind === 'referee' && !isReferee(ctx)) return deny(`Only a referee can ${phrase}.`);
    if (!entry.allowed_modes.includes(game.mode)) {
      return deny(commandModesSentence(commandType, entry.allowed_modes, game.mode));
    }
  }
  return deny(`You can't ${phrase} while the party ${sessionModeNow(game.mode)}.`);
}

/**
 * Whether the user may send a command now. The command must be in `game.commands`, which lists the commands
 * that are legal in the current mode and that the user's role may send.
 *
 * @param ctx - The permission context.
 * @param commandType - The command, such as `move_party` or `cast_spell`.
 * @param memberId - The acting member, for a member command.
 */
export function canSendCommand(ctx: PermissionContext, commandType: string, memberId?: string): Permission {
  const game = ctx.game;
  if (game === null) return NO_GAME;
  const command = game.commands.find((candidate) => candidate.command_type === commandType);
  if (command === undefined) return notLegal(ctx, game, commandType);
  const phrase = commandInfo(commandType).phrase;
  switch (command.class) {
    case 'battle':
      return deny(
        `During a battle, you don't ${phrase} directly. Declare an action for each character on the battle board instead.`,
      );
    case 'referee':
      if (!isReferee(ctx)) return deny(`Only a referee can ${phrase}.`);
      if (!ctx.lens) return deny(`Turn on the referee lens to ${phrase}.`);
      return ALLOWED;
    case 'member':
      if (memberId === undefined)
        return isReferee(ctx) || seatedMemberIds(ctx).length > 0
          ? ALLOWED
          : deny(`You need a character in the party to ${phrase}. ${SEATS}`);
      return canControlMember(ctx, memberId, phrase);
    case 'party':
      return canActForParty(ctx, phrase);
  }
}

/**
 * Whether the user may save or clear a battle declaration for a member.
 *
 * @param ctx - The permission context.
 * @param memberId - The party member.
 */
export function canDeclare(ctx: PermissionContext, memberId: string): Permission {
  const control = canControlMember(ctx, memberId, 'declare an action');
  if (!control.allowed) return control;
  const declarers = ctx.game?.view.encounter?.declarers ?? [];
  const name = memberName(ctx, memberId);
  if (!declarers.includes(memberId))
    return deny(`${name} can't act this round, so there is no action to declare.`);
  return ALLOWED;
}

/**
 * Whether the user may resolve the battle round.
 *
 * @param ctx - The permission context.
 * @param options - `early: true` asks about resolving before everyone has declared, which only a referee may.
 */
export function canResolveRound(ctx: PermissionContext, options: { early?: boolean } = {}): Permission {
  if (options.early) {
    return isReferee(ctx)
      ? ALLOWED
      : deny(
          'Wait until every character has declared an action. Only a referee can resolve the round sooner.',
        );
  }
  return canActForParty(ctx, commandInfo('resolve_battle_round').phrase);
}
