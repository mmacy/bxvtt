/**
 * The text context for the open table: the names that `describeEvents`, `describeRejection`, and
 * `humanizeMessage` need to name party members, monsters, items, and places instead of showing IDs.
 *
 * The table store keeps a player-visible context and carries it forward across game states, as the text README
 * instructs: party names, encounter groups, the player view's dungeon and area names, and `scene.names`. `useTextContext` adds the
 * catalog names that have loaded, and for a referee with the lens on, the referee state and the adventure's
 * names.
 */
import { extendContextWithCatalog, extendContextWithReferee, type TextContext } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useLoadedCatalogNames } from './rules';
import { useTableStore } from './table/context';
import { useRefereeState } from './table/hooks';
import { useAdventureDocument } from './table/referee';

/**
 * The text context to describe anything at the open table.
 *
 * ```tsx
 * const ctx = useTextContext();
 * const lines = describeEvents(entry.events, ctx, { messages: entry.messages });
 * ```
 */
export function useTextContext(): TextContext {
  const base = useTableStore((s) => s.baseTextContext);
  const catalogs = useLoadedCatalogNames();
  const referee = useRefereeState();
  const adventure = useAdventureDocument().data;
  const { equipment, magicItems, spells, monsters } = catalogs;

  return useMemo(() => {
    let ctx = base;
    if (equipment || magicItems || spells || monsters) {
      ctx = extendContextWithCatalog(ctx, {
        equipment: equipment ?? undefined,
        magicItems: magicItems ?? undefined,
        spells: spells ?? undefined,
        monsters: monsters ?? undefined,
      });
    }
    if (referee !== null) {
      ctx = extendContextWithReferee(ctx, {
        monsters: referee.monsters,
        npcs: referee.npcs.flatMap((npc) =>
          typeof npc.id === 'string'
            ? [{ id: npc.id, name: npc.name, class_id: npc.class_id, level: npc.level }]
            : [],
        ),
        encounter: referee.encounter,
        adventure: adventure ?? undefined,
      });
    }
    return ctx;
  }, [base, equipment, magicItems, spells, monsters, referee, adventure]);
}
