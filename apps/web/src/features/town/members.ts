/**
 * Small helpers that describe party members for the town's pickers. They read the player view and decide
 * nothing about the rules.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { conditionLabel } from '@bxvtt/shared/text';

/** What is wrong with a member, as the player view reports it. */
export interface MemberStatus {
  dead: boolean;
  /** Missing hit points. */
  hurt: boolean;
  /** Conditions other than death, such as poison or disease, as labels. */
  afflictions: string[];
}

/**
 * Reads a member's status from their hit points and conditions.
 *
 * @param member - A member of `PlayerView.party`.
 */
export function memberStatus(member: MemberView): MemberStatus {
  const dead = member.conditions.includes('dead');
  return {
    dead,
    hurt: !dead && member.current_hp < member.max_hp,
    afflictions: member.conditions.filter((condition) => condition !== 'dead').map(conditionLabel),
  };
}

/** Lower numbers sort first: the dead, then the afflicted, then the hurt, then everyone else. */
function urgency(member: MemberView): number {
  const status = memberStatus(member);
  if (status.dead) return 0;
  if (status.afflictions.length > 0) return 1;
  if (status.hurt) return 2;
  return 3;
}

/**
 * Orders members for the temple: the dead, the afflicted, and the hurt come first, and marching order breaks
 * ties.
 *
 * @param party - The party in marching order.
 */
export function neediestFirst(party: readonly MemberView[]): MemberView[] {
  return party
    .map((member, index) => ({ member, index }))
    .sort((a, b) => urgency(a.member) - urgency(b.member) || a.index - b.index)
    .map((entry) => entry.member);
}

/** Whether a member has anything the temple could help with. */
export function needsTemple(member: MemberView): boolean {
  return urgency(member) < 3;
}
