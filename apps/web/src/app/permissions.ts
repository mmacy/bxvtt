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

/** What a permission check reads. Build it with `usePermissionContext`. */
export interface PermissionContext {
  userId: string | null;
  role: Role | null;
  /** Whether the referee lens is on. It matters only for referee commands. */
  lens: boolean;
  game: GameState | null;
  settings: TableSettings | null;
}

/** The answer of a permission check, with a sentence for a disabled control's tooltip when it is `false`. */
export type Permission = { allowed: true; reason: null } | { allowed: false; reason: string };

const ALLOWED: Permission = { allowed: true, reason: null };

function deny(reason: string): Permission {
  return { allowed: false, reason };
}

function memberName(ctx: PermissionContext, memberId: string): string {
  return (
    ctx.game?.seats.find((seat) => seat.member_id === memberId)?.name ??
    ctx.game?.view.party.find((member) => member.id === memberId)?.name ??
    'that character'
  );
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
 */
export function canControlMember(ctx: PermissionContext, memberId: string): Permission {
  if (ctx.game === null) return deny('No game is running.');
  if (isReferee(ctx)) return ALLOWED;
  const seat = ctx.game.seats.find((candidate) => candidate.member_id === memberId);
  if (seat !== undefined && seat.user_id !== null && seat.user_id === ctx.userId) return ALLOWED;
  const name = memberName(ctx, memberId);
  return deny(`Only the player in ${name}'s seat or the referee can act for ${name}.`);
}

/** Whether the user may act for the whole party: a referee, the caller, or a seated member when anyone may. */
export function canActForParty(ctx: PermissionContext): Permission {
  if (ctx.game === null) return deny('No game is running.');
  if (isReferee(ctx)) return ALLOWED;
  // The table setting decides, as on the server. `null` there means no caller.
  const callerId = ctx.settings !== null ? ctx.settings.caller_user_id : ctx.game.caller_user_id;
  if (callerId !== null && callerId === ctx.userId) return ALLOWED;
  if (ctx.settings?.party_control === 'anyone') {
    if (seatedMemberIds(ctx).length > 0) return ALLOWED;
    return deny('Only a player with a character, the caller, or the referee can act for the party.');
  }
  return deny('Only the caller or the referee can act for the whole party.');
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
  if (ctx.game === null) return deny('No game is running.');
  const command = ctx.game.commands.find((candidate) => candidate.command_type === commandType);
  if (command === undefined) {
    if (ctx.game.ended) return deny('The game has ended.');
    return deny("The party can't do that right now.");
  }
  switch (command.class) {
    case 'battle':
      return deny('During battle, declare an action for each character instead.');
    case 'referee':
      if (!isReferee(ctx)) return deny('Only the referee can do that.');
      if (!ctx.lens) return deny('Turn on the referee lens to use referee tools.');
      return ALLOWED;
    case 'member':
      if (memberId === undefined)
        return isReferee(ctx) || seatedMemberIds(ctx).length > 0
          ? ALLOWED
          : deny("You don't control any characters.");
      return canControlMember(ctx, memberId);
    case 'party':
      return canActForParty(ctx);
  }
}

/**
 * Whether the user may save or clear a battle declaration for a member.
 *
 * @param ctx - The permission context.
 * @param memberId - The party member.
 */
export function canDeclare(ctx: PermissionContext, memberId: string): Permission {
  const control = canControlMember(ctx, memberId);
  if (!control.allowed) return control;
  const declarers = ctx.game?.view.encounter?.declarers ?? [];
  if (!declarers.includes(memberId))
    return deny(`${memberName(ctx, memberId)} can't declare an action this round.`);
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
    return isReferee(ctx) ? ALLOWED : deny('Only the referee can resolve a round before everyone declares.');
  }
  return canActForParty(ctx);
}
