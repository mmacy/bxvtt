/**
 * Small conversions from bxapi values to what kit components take.
 */
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
