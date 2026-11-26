/**
 * Small conversions from bxapi values to what kit components and view text take.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { classLabel } from '@bxvtt/shared/text';
import type { CharacterClassKey } from '@/ui';

const CLASS_KEYS: Record<string, CharacterClassKey> = {
  cleric: 'cleric',
  dwarf: 'dwarf',
  elf: 'elf',
  fighter: 'fighter',
  halfling: 'halfling',
  magic_user: 'magic-user',
  thief: 'thief',
};

/**
 * The kit's class icon key for a bxapi class ID, such as `magic_user`, or `undefined` for a class the kit has no
 * icon for. Pass it to `TokenPortrait` as `characterClass`.
 *
 * @param classId - The bxapi class ID.
 */
export function tokenClass(classId: string | null | undefined): CharacterClassKey | undefined {
  return classId === null || classId === undefined ? undefined : CLASS_KEYS[classId];
}

/**
 * The name of a party member's class, such as `Fighter`. The player view states it from the class definition
 * the character uses, so it is right for a class the adventure or the referee wrote. The catalog names the class
 * only for a view from before bxapi stated it.
 */
export function memberClassName(member: Pick<MemberView, 'class_id' | 'class_name'>): string {
  return member.class_name || classLabel(member.class_id);
}
