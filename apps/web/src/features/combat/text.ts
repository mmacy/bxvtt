/**
 * The creatures of the open encounter as the combat views offer them as targets: each living or fallen creature
 * the player view lists, with what the table calls it, such as "Goblin 2". The text context names the same
 * creatures in sentences, from the same player view.
 */
import { creatureNames, type CreatureName } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useEncounter } from '@/app';

/** The creatures of the open encounter, with their names, or an empty list outside an encounter. */
export function useEncounterCreatures(): CreatureName[] {
  const encounter = useEncounter();
  return useMemo(() => creatureNames(encounter?.groups), [encounter]);
}
