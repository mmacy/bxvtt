/**
 * Whether a member can cast spells at their level, and why they have nothing to cast now, from the class catalog
 * (a magic ability and spell slots at the member's level) and the feed (the member's last preparation and the
 * spells cast since).
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { FeedEntry } from '@bxvtt/shared/protocol';
import { useMemo } from 'react';
import { useFeed, useRulesEntry, type ClassDetail } from '@/app';
import { memorizedSpells } from './model';

export interface CastingState {
  /** Whether the member's class casts spells at the member's level. */
  caster: boolean;
  /** Why the member has nothing to cast, or `null` when they have a spell memorized or don't cast. */
  reason: string | null;
}

/**
 * Whether the class casts spells at a level: it has a magic ability, and its progression gives that level at
 * least one spell slot.
 */
export function classCastsAt(entry: ClassDetail | null, level: number): boolean {
  if (entry === null) return false;
  // Read defensively: a catalog entry that failed to load in part shouldn't break the composer.
  const abilities = Array.isArray(entry.abilities) ? entry.abilities : [];
  const progression = Array.isArray(entry.progression) ? entry.progression : [];
  const magic = abilities.some((a) => a.tag === 'arcane_magic' || a.tag === 'divine_magic');
  const row = progression.find((p) => p.level === level);
  const slots = Array.isArray(row?.spell_slots) ? row.spell_slots : [];
  return magic && slots.some((n) => typeof n === 'number' && n > 0);
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

/** The reason text for a caster with nothing to cast. */
export function noSpellsReason(name: string, spent: boolean): string {
  return spent
    ? `${name} has cast every memorized spell. Rest for a night to prepare spells again.`
    : `${name} has no spells memorized. Rest for a night, then prepare spells from the Spells tab on ${name}'s sheet.`;
}

/** Whether a member casts, and why they have nothing to cast now. */
export function useCasting(member: MemberView): CastingState {
  const entry = useRulesEntry<ClassDetail>(`classes/${member.class_id}`).data;
  const feed = useFeed();
  return useMemo(() => {
    const caster = classCastsAt(entry, member.level) || (member.spell_book ?? []).length > 0;
    if (!caster || memorizedSpells(member).length > 0) return { caster, reason: null };
    return { caster, reason: noSpellsReason(member.name, castEverySpell(feed, member.id)) };
  }, [entry, member, feed]);
}

/**
 * Whether a member's class is a spellcasting class at all (a magic ability in the class catalog), or has a spell
 * book, whatever their level. The row's suggestion keeps such members out of melee by default.
 */
export function useMemberCasts(member: MemberView | null): boolean {
  const entry = useRulesEntry<ClassDetail>(member ? `classes/${member.class_id}` : null).data;
  if (member === null) return false;
  const abilities = Array.isArray(entry?.abilities) ? entry.abilities : [];
  const magic = abilities.some((a) => a.tag === 'arcane_magic' || a.tag === 'divine_magic');
  return magic || (member.spell_book ?? []).length > 0;
}
