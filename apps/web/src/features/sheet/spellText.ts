/**
 * Short spell facts for cards. The catalog prints a range such as "120’" or "The caster", and some durations
 * point at prose the card doesn't show, such as "One or more days (see below)".
 */
import { lowerFirst } from '@bxvtt/shared/text';

/** "Range: 120’", or "Range: the caster" for a range that isn't a distance. */
export function spellRange(range: string): string {
  return /^\d/.test(range.trim()) ? `Range: ${range.trim()}` : `Range: ${lowerFirst(range.trim())}`;
}

/**
 * Catalog prose without its pointers to other text, such as "(see below)" or "(see Hit point modifiers)", which
 * refer to pages of the rulebook that a card or dialog doesn't show.
 */
export function withoutPointers(text: string): string {
  return text
    .replace(/\s*\(see\b[^)]*\)/gi, '')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/** The duration without a pointer to text the card doesn't show. */
export function spellDuration(duration: string): string {
  return withoutPointers(duration);
}

/** The first sentence of a mode's prose, which tells two ways to cast a spell apart when they share a label. */
export function firstSentence(text: string): string {
  const line = withoutPointers(text).split('\n')[0] ?? '';
  const match = /^(.*?[.!?])(\s|$)/.exec(line);
  return (match?.[1] ?? line).trim();
}
