/**
 * Whether a member can cast spells at their level, and why they have nothing to cast now, from the view (the
 * member's `spell_slots`, spell book, memorized spells, and `needs_sleep_to_prepare`) and the feed (the member's
 * last preparation and the spells cast since).
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { FeedEntry } from '@bxvtt/shared/protocol';
import { useMemo } from 'react';
import { useFeed } from '@/app';
import { memorizedSpells } from './model';

export interface CastingState {
  /** Whether the member's class casts spells at the member's level. */
  caster: boolean;
  /** Why the member has nothing to cast, or `null` when they have a spell memorized or don't cast. */
  reason: string | null;
}

/**
 * Whether the feed shows that the member prepared spells and has cast since. A feed that doesn't reach back to the
 * preparation can't tell, and then the answer is `false`.
 */
export function castEverySpell(feed: readonly FeedEntry[], memberId: string): boolean {
  let prepared = false;
  let castSince = false;
  for (const entry of feed) {
    if (entry.kind !== 'game') continue;
    for (const event of entry.events) {
      const record = event as { event_type: string; caster_id?: unknown; code?: string };
      if (record.caster_id !== memberId) continue;
      if (record.event_type === 'spells_memorized') {
        prepared = true;
        castSince = false;
      } else if (record.event_type === 'spell_cast' || record.event_type === 'spell_disrupted') {
        castSince = true;
      }
    }
  }
  return prepared && castSince;
}

/**
 * The reason text for a caster with nothing to cast.
 *
 * @param name - The caster's name.
 * @param spent - Whether the caster has cast every spell they prepared, from [`castEverySpell`][castEverySpell].
 * @param needsSleep - The member's `needs_sleep_to_prepare`: whether they have to sleep before they can prepare.
 */
export function noSpellsReason(name: string, spent: boolean, needsSleep: boolean): string {
  const what = spent ? `${name} has cast every memorized spell.` : `${name} has no spells memorized.`;
  if (spent && needsSleep) return `${what} Rest for a night to prepare spells again.`;
  const sheet = `from the Spells tab on ${name}'s sheet.`;
  return needsSleep
    ? `${what} Rest for a night, then prepare spells ${sheet}`
    : `${what} Prepare spells ${sheet}`;
}

/** Whether a member casts, and why they have nothing to cast now. */
export function useCasting(member: MemberView): CastingState {
  const feed = useFeed();
  return useMemo(() => {
    const caster = member.spell_slots.some((n) => n > 0) || member.spell_book.length > 0;
    if (!caster || memorizedSpells(member).length > 0) return { caster, reason: null };
    const spent = castEverySpell(feed, member.id);
    return { caster, reason: noSpellsReason(member.name, spent, member.needs_sleep_to_prepare) };
  }, [member, feed]);
}

/**
 * Whether a member's class casts spells at all, whatever their level: the view gives a caster's class an entry in
 * `spell_slots` for each spell level, and a class that casts nothing none. A spell book or a memorized spell
 * counts too. The row's suggestion keeps such members out of melee by default.
 */
export function memberCasts(member: MemberView | null): boolean {
  if (member === null) return false;
  return member.spell_slots.length > 0 || member.spell_book.length > 0 || member.memorized_spells.length > 0;
}
