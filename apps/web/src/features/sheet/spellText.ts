/**
 * Short spell facts for cards. The catalog prints a range such as "120’" or "The caster", and some durations
 * point at prose the card doesn't show, such as "One or more days (see below)".
 */
import { lowerFirst } from '@bxvtt/shared/text';

/** "Range 120’", or "Range: the caster" for a range that isn't a distance. */
export function spellRange(range: string): string {
  return /^\d/.test(range.trim()) ? `Range ${range.trim()}` : `Range: ${lowerFirst(range.trim())}`;
}

/** The duration without a pointer to text the card doesn't show. */
export function spellDuration(duration: string): string {
  return duration.replace(/\s*\((?:see|as) (?:below|above)[^)]*\)/gi, '').trim();
}
