import { z } from 'zod';
import type { BattleDeclaration } from '../bxapi';
import { MemberId, UserId } from './common';
import { GameState } from './game';

export type { BattleDeclaration };

/**
 * A declaration for one member, as a client sends it: bxapi's `BattleDeclaration` without `character_id`,
 * which the route names. bxapi checks the fields when the round resolves.
 */
export const DeclarationBody = z.looseObject({
  action: z.enum(['attack', 'cast', 'turn_undead', 'move', 'use_item', 'give_item', 'hold']),
  character_id: z.string().max(64).optional(),
});
/** A declaration for one member, as a client sends it. */
export type DeclarationBody = z.infer<typeof DeclarationBody>;

/** Body of `PUT /api/tables/{table_id}/game/declarations/{member_id}`. The seat's user or a referee may send it. */
export const SaveDeclarationRequest = z.strictObject({
  declaration: DeclarationBody,
});
/** Body of `PUT /api/tables/{table_id}/game/declarations/{member_id}`. */
export type SaveDeclarationRequest = z.infer<typeof SaveDeclarationRequest>;

/** One rejection bxapi gave a round, with the member whose declaration it concerns, when the rejection names one. */
export const DeclarationRefusal = z.object({
  member_id: MemberId.nullable(),
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
});
/** One rejection bxapi gave a round. */
export type DeclarationRefusal = z.infer<typeof DeclarationRefusal>;

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
  /** bxapi's rejections of the last attempt to resolve this round, or an empty list. */
  refusals: z.array(DeclarationRefusal),
});
/** The declarations for the current battle round. */
export type DeclarationsState = z.infer<typeof DeclarationsState>;

/**
 * Body of `POST /api/tables/{table_id}/game/declarations/resolve`. The caller or a referee may resolve a round
 * once every declarer has declared. A referee may pass `fill_with_hold` to resolve early, and the server then
 * declares `hold` for each member who hasn't declared.
 */
export const ResolveRoundRequest = z.strictObject({
  fill_with_hold: z.boolean().optional(),
});
/** Body of `POST /api/tables/{table_id}/game/declarations/resolve`. */
export type ResolveRoundRequest = z.infer<typeof ResolveRoundRequest>;

/**
 * Response of `POST /api/tables/{table_id}/game/declarations/resolve`. When bxapi refuses the round, `accepted`
 * is `false`, the declarations stay, and `declarations.refusals` names each declaration bxapi refused.
 */
export const ResolveRoundResult = z.object({
  accepted: z.boolean(),
  declarations: DeclarationsState,
  game: GameState,
});
/** Response of `POST /api/tables/{table_id}/game/declarations/resolve`. */
export type ResolveRoundResult = z.infer<typeof ResolveRoundResult>;
