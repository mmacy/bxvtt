import type { Rejection } from '@bxvtt/shared/bxapi';
import type { DeclarationRefusal } from '@bxvtt/shared/protocol';

/**
 * Says whose declaration each rejection of a refused battle round is about. Since osrlib 2.7, every rejection of
 * a declaration names the declaring member in `params.character`. A rejection of the round as a whole, such as
 * `battle.declaration.roster_mismatch`, names no declarer and gets `member_id: null`.
 *
 * @param rejections - bxapi's rejections of the round.
 * @param declarers - The members who declared.
 * @returns One refusal for each rejection, in bxapi's order.
 */
export function attributeRefusals(
  rejections: readonly Rejection[],
  declarers: readonly string[],
): DeclarationRefusal[] {
  return rejections.map((rejection) => {
    const params = rejection.params;
    const character = params.character;
    return {
      member_id: typeof character === 'string' && declarers.includes(character) ? character : null,
      code: rejection.code,
      params,
    };
  });
}

/**
 * Lists the rejections of a battle round preview as refusals, in the order of the declarers.
 *
 * @param rejections - The preview's rejections, keyed by the declaring member's ID.
 * @param declarers - The members who must declare this round, in marching order.
 */
export function previewRefusals(
  rejections: Readonly<Record<string, readonly Rejection[]>>,
  declarers: readonly string[],
): DeclarationRefusal[] {
  const order = [...declarers, ...Object.keys(rejections).filter((id) => !declarers.includes(id))];
  return order.flatMap((memberId) =>
    (rejections[memberId] ?? []).map((rejection) => ({
      member_id: memberId,
      code: rejection.code,
      params: rejection.params,
    })),
  );
}
