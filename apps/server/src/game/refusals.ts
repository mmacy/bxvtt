import type { BattleDeclaration, DeclarationRefusal } from '@bxvtt/shared/protocol';

/** A rejection as bxapi returns it. */
export interface RoundRejection {
  code: string;
  params?: Record<string, unknown> | null;
}

/** The params that name the member a rejection is about, in the order the server trusts them. */
const MEMBER_PARAMS = ['character', 'caster', 'attacker', 'member'];

/**
 * Whether a declaration moves its member: it sets `move`, or its action is `move`. osrlib projects every
 * declared move before it judges the round, so replacing a moving declaration can change how the others are
 * judged, and the server never probes one.
 */
export function movesMember(declaration: BattleDeclaration): boolean {
  return declaration.action === 'move' || (declaration.move !== null && declaration.move !== undefined);
}

/**
 * The probe declaration for a member: a `hold` that sets `back_stab`. osrlib checks `back_stab` before
 * anything else and refuses it on any action but `attack` with `battle.declaration.back_stab_not_attack`,
 * naming the member in `character`. So a round with this declaration is always refused, and the member it
 * replaces stays where it stood.
 */
function sentinel(memberId: string): BattleDeclaration {
  return { character_id: memberId, action: 'hold', back_stab: true, reversed: false, targets: [] };
}

/** A key that compares two rejections by code and params. */
function rejectionKey(rejection: RoundRejection): string {
  const params = rejection.params ?? {};
  const sorted = Object.fromEntries(
    Object.keys(params)
      .sort()
      .map((key) => [key, params[key]]),
  );
  return `${rejection.code} ${JSON.stringify(sorted)}`;
}

/** The declarer a rejection's params name, or `null`. */
function namedMember(rejection: RoundRejection, declarers: readonly string[]): string | null {
  const params = rejection.params ?? {};
  for (const key of MEMBER_PARAMS) {
    const value = params[key];
    if (typeof value === 'string' && declarers.includes(value)) return value;
  }
  const other = Object.values(params).find(
    (value): value is string => typeof value === 'string' && declarers.includes(value),
  );
  return other ?? null;
}

/**
 * Works out which member's declaration each rejection of a refused battle round is about.
 *
 * osrlib checks the roster first: a round that leaves out a declarer gets only `roster_mismatch`, so a
 * declaration can't be judged alone. Otherwise it judges every declaration and returns every rejection, each
 * member's in the order of the declarations, then the rejections of the trades of places, without saying
 * where one member's rejections end. Many rejections name the member in a param, and some name nobody, such
 * as `combat.attack.out_of_reach` or `magic.cast.too_many_targets`. The server attributes them in three steps:
 *
 * 1. A rejection whose params name a declarer, in `character`, `caster`, `attacker`, `member`, or any other
 *    param, is that declarer's.
 * 2. A `hold` is refused only with a rejection that names its member, so a rejection that names nobody comes
 *    from a declaration that isn't a `hold`. When only one such declaration is left, the rejection is its.
 * 3. Otherwise the server probes: it sends the round again with one member's declaration replaced by
 *    {@link sentinel}, which osrlib always refuses. The probe changes nothing and can't resolve the round. The
 *    member stays where it stood, so when its own declaration moves nobody, the others are judged exactly as
 *    before, and the rejections that the probe lacks were that member's. When the member and another both got
 *    the same rejection, the order decides: a member's rejections come before those of every member who
 *    declared after it. The server never probes a member whose declaration moves, because a different
 *    projection could change how the others are judged, and it stops at a probe that fails or that changes the
 *    others' rejections.
 *
 * A rejection still unattributed after the probes gets `member_id: null` and `candidates`, the members whose
 * declarations could have caused it.
 *
 * @param declarations - The round's declarations, as sent, in order.
 * @param rejections - bxapi's rejections of the round.
 * @param probe - Sends a round that osrlib will refuse and returns its rejections, or `null` when the probe
 *   failed for another reason, such as a revision conflict.
 * @returns One refusal for each rejection, in bxapi's order.
 */
export async function attributeRefusals(
  declarations: readonly BattleDeclaration[],
  rejections: readonly RoundRejection[],
  probe: (declarations: BattleDeclaration[]) => Promise<RoundRejection[] | null>,
): Promise<DeclarationRefusal[]> {
  const declarers = declarations.map((declaration) => declaration.character_id);
  const owners: (string | null)[] = rejections.map((rejection) => namedMember(rejection, declarers));
  // Every declaration that isn't a plain hold could have caused a rejection that names nobody.
  const possible = declarations
    .filter((declaration) => declaration.action !== 'hold' || declaration.back_stab === true)
    .map((declaration) => declaration.character_id);
  const suspects: string[][] = owners.map((owner) => (owner === null ? [...possible] : []));
  const settle = () => {
    suspects.forEach((members, index) => {
      if (owners[index] === null && members.length === 1) owners[index] = members[0] ?? null;
    });
  };
  const unsettled = () => owners.some((owner, index) => owner === null && (suspects[index]?.length ?? 0) > 1);
  const counts = new Map<string, number>();
  for (const rejection of rejections) {
    const key = rejectionKey(rejection);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  settle();
  for (const declaration of declarations) {
    if (!unsettled()) break;
    const memberId = declaration.character_id;
    const involved = owners.some((owner, index) => owner === null && suspects[index]?.includes(memberId));
    if (!involved || movesMember(declaration)) continue;
    const probed = await probe(
      declarations.map((candidate) => (candidate.character_id === memberId ? sentinel(memberId) : candidate)),
    );
    if (probed === null) break;
    // The others' rejections, which must all be among the round's. Anything else means the probe changed how
    // the others were judged, and the server stops probing.
    const others = new Map<string, number>();
    for (const rejection of probed) {
      if (namedMember(rejection, declarers) === memberId) continue;
      const key = rejectionKey(rejection);
      others.set(key, (others.get(key) ?? 0) + 1);
    }
    if ([...others].some(([key, n]) => (counts.get(key) ?? 0) < n)) break;
    const position = declarers.indexOf(memberId);
    const openOfKind = (key: string) =>
      owners.flatMap((owner, index) =>
        owner === null && rejectionKey(rejections[index] ?? { code: '' }) === key ? [index] : [],
      );
    for (const key of new Set(rejections.map(rejectionKey))) {
      const own = (counts.get(key) ?? 0) - (others.get(key) ?? 0);
      const copies = openOfKind(key);
      if (own === 0) {
        // The others produce every rejection of this kind, so none of them is this member's.
        for (const index of copies) suspects[index] = (suspects[index] ?? []).filter((m) => m !== memberId);
        continue;
      }
      if ((others.get(key) ?? 0) === 0) {
        // Only this member produces this kind.
        for (const index of copies) owners[index] = memberId;
        continue;
      }
      // Several members produce the same rejection. Each member's rejections come in the order of the
      // declarations, so when every other suspect declared after this member, its copies are the first ones,
      // and when every other suspect declared before it, the last ones.
      const rivals = new Set(copies.flatMap((index) => suspects[index] ?? []).filter((m) => m !== memberId));
      const order = [...rivals].map((m) => declarers.indexOf(m));
      const picked = order.every((other) => other > position)
        ? copies.slice(0, own)
        : order.every((other) => other < position)
          ? copies.slice(copies.length - own)
          : [];
      for (const index of picked) owners[index] = memberId;
      for (const index of copies) {
        if (!picked.includes(index) && picked.length > 0) {
          suspects[index] = (suspects[index] ?? []).filter((m) => m !== memberId);
        }
      }
    }
    settle();
  }

  return rejections.map((rejection, index) => {
    const memberId = owners[index] ?? null;
    return {
      member_id: memberId,
      code: rejection.code,
      params: (rejection.params ?? {}) as Record<string, unknown>,
      ...(memberId === null ? { candidates: suspects[index] ?? [] } : {}),
    };
  });
}
