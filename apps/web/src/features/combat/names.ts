/**
 * How the combat views write a monster group's label, so a named individual such as "Mag Corrie" reads as a
 * name: no article, no plural, no count, and never in lower case. The rule comes from the text layer: a label the
 * adventure capitalizes is a proper name (`isProperLabel`).
 */
import { countedLabel, isProperLabel, pluralize } from '@bxvtt/shared/text';

/** The parts of a group these helpers read, from the view or from the range track. */
export interface GroupLabels {
  label: string;
  plural?: string;
  count: number;
}

function pluralOf(group: GroupLabels): string {
  return group.plural && group.plural !== '' ? group.plural : pluralize(group.label);
}

/** Whether the group is one named individual, such as Mag Corrie. */
export function isNamedOne(group: GroupLabels): boolean {
  return isProperLabel(group.label) && group.count <= 1;
}

/** The group as a heading or a tile title: "Goblins", "Goblin", "Mag Corrie". */
export function groupHeading(group: GroupLabels): string {
  if (isProperLabel(group.label)) return group.count <= 1 ? group.label : pluralOf(group);
  const noun = group.count === 1 ? group.label : pluralOf(group);
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/** The group in a sentence: "the goblins", "the goblin", "Mag Corrie". */
export function theGroup(group: GroupLabels): string {
  if (isNamedOne(group)) return group.label;
  return `the ${group.count === 1 ? group.label : pluralOf(group)}`;
}

/** The group with its count: "3 goblins", "a goblin", "Mag Corrie". */
export function countedGroup(group: GroupLabels): string {
  return countedLabel(group.label, group.plural, group.count);
}

/** "is" or "are", to follow {@link theGroup} or {@link countedGroup}. */
export function isAre(group: GroupLabels): 'is' | 'are' {
  return group.count === 1 ? 'is' : 'are';
}

/** A count badge such as "×3", or `null` for a single monster, whose count says nothing. */
export function countBadge(group: GroupLabels): string | null {
  return group.count > 1 ? `×${group.count}` : null;
}

/** The labels of an encounter group from the view. */
export function viewLabels(group: { label: string; label_plural?: string; count: number }): GroupLabels {
  return { label: group.label, plural: group.label_plural, count: group.count };
}
