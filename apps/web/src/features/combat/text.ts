/**
 * The text context for the combat views: the table's context with each creature of the open encounter named as
 * the table calls it, so a declaration, a refusal, or a playback step that names `monster-0002` reads "Goblin 2".
 */
import type { CreatureName } from '@bxvtt/shared/protocol';
import { creatureNames } from '@bxvtt/shared/protocol';
import { pluralize, type TextContext } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useEncounter, useTextContext } from '@/app';

/** The parts of an encounter that {@link encounterCreatures} reads. A bxapi `EncounterView` fits it. */
type EncounterLike = { groups: Parameters<typeof creatureNames>[0] } | null | undefined;

/** Every creature of the open encounter, with its name, or an empty list outside an encounter. */
export function encounterCreatures(encounter: EncounterLike): CreatureName[] {
  return creatureNames(encounter?.groups);
}

/**
 * Names each creature of the encounter: "Goblin 2", or "Mag Corrie" for the only one of that name. A name the
 * context already has, such as an NPC adventurer's name in a referee's context, stays.
 */
export function withCreatureNames(ctx: TextContext, creatures: readonly CreatureName[]): TextContext {
  if (creatures.length === 0) return ctx;
  const monsters = { ...ctx.monsters };
  for (const creature of creatures) {
    const group = ctx.groups[creature.group_id];
    const known = monsters[creature.id];
    const label = group?.label ?? known?.label ?? creature.name.replace(/\s+\d+$/, '').toLowerCase();
    monsters[creature.id] = {
      ...known,
      label,
      labelPlural: group?.labelPlural ?? known?.labelPlural ?? pluralize(label),
      // A referee's context names an NPC adventurer by the NPC's own name, which stays.
      name: known?.name ?? creature.name,
    };
  }
  return { ...ctx, monsters };
}

/** The creatures of the open encounter, with their names. */
export function useEncounterCreatures(): CreatureName[] {
  const encounter = useEncounter();
  return useMemo(() => encounterCreatures(encounter), [encounter]);
}

/** The text context with the encounter's creatures named. */
export function useCombatText(): TextContext {
  const ctx = useTextContext();
  const creatures = useEncounterCreatures();
  return useMemo(() => withCreatureNames(ctx, creatures), [ctx, creatures]);
}
