/**
 * The creatures of the open encounter as the combat views offer them as targets: each living or fallen creature
 * the player view lists, with what the table calls it, such as "Goblin 2". The text context names the same
 * creatures in sentences, from the same player view.
 */
import { creatureNames, type CreatureName } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useEncounter } from '@/app';

/** The parts of an encounter that {@link encounterCreatures} reads. A bxapi `EncounterView` fits it. */
type EncounterLike = { groups: Parameters<typeof creatureNames>[0] } | null | undefined;

/** Every creature of the open encounter, with its name, or an empty list outside an encounter. */
export function encounterCreatures(encounter: EncounterLike): CreatureName[] {
  return creatureNames(encounter?.groups);
}

/** The creatures of the open encounter, with their names. */
export function useEncounterCreatures(): CreatureName[] {
  const encounter = useEncounter();
  return useMemo(() => encounterCreatures(encounter), [encounter]);
}
