/**
 * The quick action: each member's highlighted one-click choice on the battle board and the action bar.
 *
 * The client never judges whether an attack reaches. It lists each member's plausible choices in order, from facts
 * the view states, and asks bxapi's round preview which of them the session would accept beside the declarations
 * already saved. The quick action is the first choice bxapi accepts, so clicking it never holds up the round.
 */
import type { EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody, PreviewCandidatesResult } from '@bxvtt/shared/protocol';
import { groupName, type TextContext } from '@bxvtt/shared/text';
import { useEffect, useState } from 'react';
import { getApi, useTableId } from '@/app';
import {
  attackDeclaration,
  attackPlans,
  describeDeclaration,
  hasArmour,
  liveGroups,
  memberDistance,
  memorizedSpells,
  type MemberGear,
  type SuggestionFacts,
} from './model';

/** The row's highlighted choice, in words for its button. */
export interface QuickAction {
  kind: 'melee' | 'missile' | 'cast' | 'close' | 'hold';
  label: string;
  /** What the button declares, or `null` for a choice that opens the composer (a spell). */
  body: DeclarationBody | null;
  /** Why the suggestion is to hold, shown under the member's name. */
  reason: string | null;
  /**
   * Whether bxapi's preview has to accept the choice before the board offers it. A spell, which only opens the
   * composer, and a hold, which the session always accepts, don't need it.
   */
  checked: boolean;
}

export interface QuickFacts extends SuggestionFacts {
  /** Whether bxapi lists the member in `can_back_stab` this round. */
  canBackStab?: boolean;
}

/**
 * A member's plausible one-click choices, best first. Every choice that declares an attack or a move waits for
 * bxapi's preview, and the board offers the first one it accepts:
 *
 * 1. A back-stab on the nearest group, for a member bxapi lists in `can_back_stab`.
 * 2. A melee attack on a group whose `front_rank` holds the member.
 * 3. A shot or a throw at the nearest group with a wielded missile weapon the member can fire (`reloading`).
 * 4. The Cast tab, for a member with a spell memorized. It never casts for them.
 * 5. For a member who looks like a front-line fighter (in the party's `front_rank`, wielding a real melee weapon,
 *    wearing armour or a shield, of a class that casts no spells, and not `immobile`): closing in and attacking
 *    the nearest group, then closing in without attacking.
 * 6. Holding, only for a member with no choice above.
 *
 * @param member - The member.
 * @param encounter - The encounter view.
 * @param gear - The member's gear.
 * @param ctx - The text context.
 * @param facts - What the class catalog and bxapi's lists say about the member.
 */
export function quickCandidates(
  member: MemberView,
  encounter: EncounterView | null,
  gear: MemberGear,
  ctx: TextContext,
  facts: QuickFacts,
): QuickAction[] {
  if (encounter === null) return [];
  const groups = liveGroups(encounter);
  if (groups.length === 0) return [];
  const byDistance = [...groups].sort((a, b) => memberDistance(a, member.id) - memberDistance(b, member.id));
  const nearest = byDistance[0];
  if (!nearest) return [];
  const list: QuickAction[] = [];
  const nearestPlans = attackPlans(member, encounter, nearest, gear);

  if (facts.canBackStab) {
    const plan = nearestPlans.find((p) => p.kind !== 'missile' && p.reason === null);
    if (plan) {
      const body: DeclarationBody = { ...attackDeclaration(plan), back_stab: true };
      const label = `Back-stab ${groupName(nearest.id, ctx)}${body.move === 'close' ? ', closing in' : ''}`;
      list.push({ kind: 'melee', label, body, reason: null, checked: true });
    }
  }
  const engaged = byDistance.find((g) => g.front_rank.includes(member.id));
  if (engaged) {
    const plan = attackPlans(member, encounter, engaged, gear)[0];
    if (plan) {
      const body = attackDeclaration(plan);
      list.push({
        kind: 'melee',
        label: describeDeclaration(body, ctx, gear),
        body,
        reason: null,
        checked: true,
      });
    }
  }
  const shot = nearestPlans.find((p) => p.kind === 'missile' && p.reason === null);
  if (shot?.weapon) {
    const group = groupName(nearest.id, ctx);
    const label = shot.weapon.thrown
      ? `Throw ${shot.weapon.name} at ${group}`
      : `Shoot at ${group} with ${shot.weapon.name}`;
    list.push({ kind: 'missile', label, body: attackDeclaration(shot), reason: null, checked: true });
  }
  if (memorizedSpells(member).length > 0) {
    list.push({ kind: 'cast', label: 'Choose a spell', body: null, reason: null, checked: false });
    return list;
  }
  const fighter =
    encounter.front_rank.includes(member.id) &&
    gear.wielded.some((w) => w.melee && !w.improvised) &&
    hasArmour(member) &&
    !facts.casts &&
    !encounter.immobile.includes(member.id);
  if (fighter && !engaged) {
    const close = nearestPlans.find((p) => p.kind === 'close');
    if (close) {
      const attack = attackDeclaration(close);
      list.push({
        kind: 'close',
        label: describeDeclaration(attack, ctx, gear),
        body: attack,
        reason: null,
        checked: true,
      });
      const move: DeclarationBody = { action: 'move', move: 'close', target_group_id: nearest.id };
      list.push({
        kind: 'close',
        label: describeDeclaration(move, ctx, gear),
        body: move,
        reason: null,
        checked: true,
      });
    }
  }
  if (list.length === 0) {
    list.push({ kind: 'hold', label: 'Hold', body: { action: 'hold' }, reason: null, checked: false });
  }
  return list;
}

/** The most preview requests one state of the round may make. */
export const MAX_PREVIEWS = 3;

/** Asks bxapi which candidates it would accept beside the saved declarations. */
export type PreviewCandidates = (
  candidates: Record<string, DeclarationBody>,
) => Promise<PreviewCandidatesResult>;

/**
 * Picks each member's quick action: the first of their candidates that bxapi's preview accepts. Each request holds
 * the current candidate of every member, so the candidates are judged beside each other's planned moves, as they
 * would be if the player clicked every suggestion. A member whose candidate is refused moves on to the next one,
 * and the next request judges it. After {@link MAX_PREVIEWS} requests, or when a request fails, a member whose
 * current candidate bxapi hasn't accepted gets no quick action.
 *
 * @param lists - Each member's candidates, best first, from {@link quickCandidates}.
 * @param preview - Sends one preview request.
 */
export async function pickQuickActions(
  lists: Readonly<Record<string, readonly QuickAction[]>>,
  preview: PreviewCandidates,
): Promise<Record<string, QuickAction | null>> {
  const index: Record<string, number> = {};
  const accepted: Record<string, number | undefined> = {};
  const members = Object.keys(lists);
  for (const id of members) index[id] = 0;
  const current = (id: string): QuickAction | undefined => lists[id]?.[index[id] ?? 0];
  for (let attempt = 0; attempt < MAX_PREVIEWS; attempt += 1) {
    const candidates: Record<string, DeclarationBody> = {};
    for (const id of members) {
      const candidate = current(id);
      if (candidate?.checked && candidate.body) candidates[id] = candidate.body;
    }
    if (Object.keys(candidates).length === 0) break;
    let result: PreviewCandidatesResult;
    try {
      result = await preview(candidates);
    } catch {
      break;
    }
    let moved = false;
    for (const id of Object.keys(candidates)) {
      if (result.accepted.includes(id)) {
        accepted[id] = index[id];
      } else {
        accepted[id] = undefined;
        index[id] = (index[id] ?? 0) + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const picked: Record<string, QuickAction | null> = {};
  for (const id of members) {
    const candidate = current(id);
    if (candidate === undefined) picked[id] = null;
    else if (!candidate.checked) picked[id] = candidate;
    else picked[id] = accepted[id] === index[id] ? candidate : null;
  }
  return picked;
}

/** The answers already asked for, by state, so the board and the action bar share one set of requests. */
const answers = new Map<string, Promise<Record<string, QuickAction | null>>>();

/** Forgets the answers. Tests call it between cases. */
export function resetQuickActions(): void {
  answers.clear();
}

/** Each member's quick action, and whether bxapi's answer for the current state is still out. */
export interface QuickAnswer {
  /**
   * The quick actions of the latest answer, by member, or `null` before any answer. While `pending`, they are the
   * previous state's, so a button can stay in place as `loading` and nothing moves.
   */
  actions: Record<string, QuickAction | null> | null;
  /** Whether the answer for the current state is still out, so a quick action shown now must not be clicked. */
  pending: boolean;
}

/**
 * Each member's quick action for the state of the round. While bxapi's answer for this state is out, it keeps the
 * previous answer and says it's pending, so the board shows the old button as `loading` rather than a stale
 * choice that could be clicked, or a gap.
 *
 * @param lists - Each member's candidates, from {@link quickCandidates}, for the members who can take one now.
 * @param state - What the answer depends on besides the candidates: the game's revision and the saved
 *   declarations.
 * @param enabled - Whether to ask at all, such as not once the battle has ended.
 */
export function useQuickActions(
  lists: Readonly<Record<string, readonly QuickAction[]>>,
  state: string,
  enabled: boolean,
): QuickAnswer {
  const tableId = useTableId();
  const key = `${tableId}|${state}|${JSON.stringify(lists)}`;
  const [answer, setAnswer] = useState<{ key: string; picked: Record<string, QuickAction | null> } | null>(
    null,
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let promise = answers.get(key);
    if (promise === undefined) {
      promise = pickQuickActions(lists, (candidates) => getApi().previewCandidates(tableId, candidates));
      answers.set(key, promise);
      // Keep only the recent states.
      if (answers.size > 20) {
        const oldest = answers.keys().next().value;
        if (oldest !== undefined) answers.delete(oldest);
      }
    }
    void promise.then((picked) => {
      // The effect runs again whenever the caller builds new lists, so it sets the answer only once per state.
      if (!cancelled) setAnswer((previous) => (previous?.key === key ? previous : { key, picked }));
    });
    return () => {
      cancelled = true;
    };
  }, [key, enabled, lists, tableId]);
  if (!enabled) return { actions: null, pending: false };
  return { actions: answer?.picked ?? null, pending: answer?.key !== key };
}
