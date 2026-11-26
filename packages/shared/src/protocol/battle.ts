import { z } from 'zod';
import type { BattleDeclaration } from '../bxapi';
import { MemberId, UserId } from './common';
import { GameState } from './game';

export type { BattleDeclaration };

/** An optional ID field of a declaration, which bxapi allows to be `null`. */
const OptionalId = z.string().max(100).nullable().optional();

/**
 * The fields of bxapi's `BattleDeclaration`, each with its shape. The `satisfies` check ties the keys to the
 * generated type: a field that bxapi adds, or one that it drops, fails the type check here instead of being
 * dropped or passed on without anyone noticing. Every field may be left out, because `character_id` comes from
 * the route and bxapi fills in its defaults.
 */
const DECLARATION_FIELDS = {
  character_id: z.string().max(64).optional(),
  action: z.enum(['attack', 'cast', 'turn_undead', 'move', 'use_item', 'give_item', 'hide', 'hold']),
  target_group_id: OptionalId,
  weapon_id: OptionalId,
  spell_id: OptionalId,
  spell_mode: OptionalId,
  reversed: z.boolean().optional(),
  targets: z.array(z.string().max(100)).max(100).optional(),
  move: z.enum(['close', 'fighting_withdrawal', 'retreat']).nullable().optional(),
  replacement_id: OptionalId,
  item_id: OptionalId,
  gaze_defense: z.enum(['avert_eyes', 'mirror']).nullable().optional(),
  back_stab: z.boolean().optional(),
} satisfies { [Key in keyof Required<BattleDeclaration>]: z.ZodType<BattleDeclaration[Key] | undefined> };

/**
 * A declaration for one member, as a client sends it: bxapi's `BattleDeclaration`, where `character_id` may be
 * left out because the route names the member. The server keeps only the fields bxapi defines and drops any
 * other, because every member of the table reads the stored declarations. bxapi checks the values when it
 * previews or resolves the round.
 */
export const DeclarationBody = z.object(DECLARATION_FIELDS);
/** A declaration for one member, as a client sends it. */
export type DeclarationBody = z.infer<typeof DeclarationBody>;

/** Body of `PUT /api/tables/{table_id}/game/declarations/{member_id}`. The seat's user or a referee may send it. */
export const SaveDeclarationRequest = z.strictObject({
  declaration: DeclarationBody,
});
/** Body of `PUT /api/tables/{table_id}/game/declarations/{member_id}`. */
export type SaveDeclarationRequest = z.infer<typeof SaveDeclarationRequest>;

/**
 * One reason the session would refuse a stored declaration, or did refuse it, with the member whose declaration
 * it is. Since osrlib 2.7, every rejection of a declaration names its member in `params.character`.
 */
export const DeclarationRefusal = z.object({
  /** The member whose declaration the session refuses, or `null` for a rejection of the round as a whole. */
  member_id: MemberId.nullable(),
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
});
/** One reason the session would refuse a stored declaration. */
export type DeclarationRefusal = z.infer<typeof DeclarationRefusal>;

/**
 * Where everyone would stand once the round's declared moves are made, and who could still hide or back-stab, from
 * bxapi's battle round preview.
 *
 * The web client offers Hide and Back-stab from `can_hide` and `can_back_stab` here when a projection exists, and
 * from `view.encounter.can_hide` and `view.encounter.can_back_stab` otherwise, such as before anyone declares or
 * when the preview failed.
 */
export const RoundProjection = z.object({
  /**
   * Each living member's place on the range track after the declared moves, in feet forward of the party line,
   * as in `view.encounter.advance_feet`.
   */
  advance_feet: z.record(z.string(), z.number()),
  /**
   * For each group that hasn't fled, keyed by group ID, the members who would stand in its front rank after the
   * declared moves, as in `view.encounter.groups[].front_rank`.
   */
  front_rank: z.record(z.string(), z.array(MemberId)),
  /**
   * The declarers who could declare `hide` beside the other stored declarations, in marching order, each judged
   * as if the hide took the place of their own declaration. From the preview's `can_hide`.
   */
  can_hide: z.array(MemberId),
  /**
   * The declarers who could declare an `attack` with `back_stab` beside the other stored declarations, in
   * marching order. From the preview's `can_back_stab`.
   */
  can_back_stab: z.array(MemberId),
});
/** Where everyone would stand once the round's declared moves are made. */
export type RoundProjection = z.infer<typeof RoundProjection>;

/**
 * The declarations for the current battle round. Everyone at the table sees them, because the party plans
 * together. The `declarations` WebSocket message carries the same object.
 */
export const DeclarationsState = z.object({
  /** Whether the party is in a battle, so declarations apply. */
  active: z.boolean(),
  /** The session revision the declarations were made at. */
  revision: z.number().int(),
  /** bxapi's battle round number, or `null` before the first round. */
  round: z.number().int().nullable(),
  /** The members who must declare this round, from `view.encounter.declarers`. */
  declarers: z.array(MemberId),
  /** The declarers who have a saved declaration. */
  declared: z.array(MemberId),
  /** The saved declarations, keyed by member ID, each with `character_id` filled in. */
  declarations: z.record(z.string(), z.custom<BattleDeclaration>()),
  /** Who saved each declaration, keyed by member ID. */
  declared_by: z.record(z.string(), UserId),
  /**
   * Why the session would refuse the stored declarations, from bxapi's battle round preview, or an empty list
   * when it would accept them. A refused declaration stays stored, because whether it works can depend on the
   * moves the others declare. The server previews the stored declarations whenever it builds this state, so
   * the list changes as members declare. When the preview fails, the list is empty and `projection` is `null`.
   */
  refusals: z.array(DeclarationRefusal),
  /**
   * Where everyone would stand once the stored declarations' moves are made, or `null` when nobody has declared
   * or the preview failed.
   */
  projection: RoundProjection.nullable(),
  /**
   * Whether bxapi's preview of the stored declarations failed, so `refusals` is empty because the server couldn't
   * check the declarations, not because they would work. The server asks bxapi again when it next builds this
   * state, at least a few seconds later, such as when a member declares, clears a declaration, or reloads.
   * Optional in the type so that the web fixtures captured before it compile. This server always sends it.
   */
  preview_unavailable: z.boolean().optional(),
});
/** The declarations for the current battle round. */
export type DeclarationsState = z.infer<typeof DeclarationsState>;

/**
 * Body of `POST /api/tables/{table_id}/game/declarations/resolve`. The caller or a referee may resolve a round
 * once every declarer has declared. A referee may pass `fill_with_hold` to resolve early, and the server then
 * declares `hold` for each member who hasn't declared. It never replaces a stored declaration, even one the
 * session would refuse, so a round with a refused declaration is refused until its member declares again.
 */
export const ResolveRoundRequest = z.strictObject({
  fill_with_hold: z.boolean().optional(),
});
/** Body of `POST /api/tables/{table_id}/game/declarations/resolve`. */
export type ResolveRoundRequest = z.infer<typeof ResolveRoundRequest>;

/**
 * Response of `POST /api/tables/{table_id}/game/declarations/resolve`. When bxapi refuses the round, `accepted`
 * is `false`, the declarations stay, and `declarations.refusals` names each declaration that bxapi refused.
 */
export const ResolveRoundResult = z.object({
  accepted: z.boolean(),
  declarations: DeclarationsState,
  game: GameState,
});
/** Response of `POST /api/tables/{table_id}/game/declarations/resolve`. */
export type ResolveRoundResult = z.infer<typeof ResolveRoundResult>;
