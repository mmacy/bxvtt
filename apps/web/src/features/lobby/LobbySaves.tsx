import type { SaveEntry } from '@bxvtt/shared/protocol';
import { formatGameClock } from '@bxvtt/shared/text';
import { useCallback, useEffect, useState } from 'react';
import { getApi, useIsReferee, useTableId } from '@/app';
import { Button } from '@/ui';
import { SavesDialog } from '@/features/referee';
import styles from './lobby.module.css';

/** The table's saves, loaded when the lobby opens and again after the saves dialog closes. */
function useSaveList(): { saves: SaveEntry[] | null; reload: () => void } {
  const tableId = useTableId();
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getApi()
      .listSaves(tableId)
      .then(
        (list) => !cancelled && setSaves(list.items),
        // The lobby works without the list: it just doesn't offer to continue.
        () => !cancelled && setSaves([]),
      );
    return () => {
      cancelled = true;
    };
  }, [tableId, version]);
  return { saves, reload: useCallback(() => setVersion((n) => n + 1), []) };
}

function saveCount(count: number): string {
  return count === 1 ? 'one save' : `${count} saves`;
}

/**
 * Continuing an earlier game from the lobby. A referee sees how many saves the table has, the newest one, and a
 * button that opens the saves dialog to restore one. A player sees that saves exist and that the referee can
 * continue from one. It shows nothing while the table has no saves.
 */
export function LobbySaves() {
  const referee = useIsReferee();
  const { saves, reload } = useSaveList();
  const [open, setOpen] = useState(false);
  if (saves === null || saves.length === 0) return null;
  const newest = saves[0];
  if (!referee) {
    return (
      <p className={styles.note}>
        This table has {saveCount(saves.length)} from earlier games. A new game starts every character as they
        were created, so the experience, treasure, and deaths of an earlier game stay in its saves. To play on
        with the characters as they were saved, the referee can continue from a save instead of starting a new
        game.
      </p>
    );
  }
  return (
    <div className={styles.continue}>
      <p className={styles.note}>
        This table has {saveCount(saves.length)} from earlier games
        {newest ? `, the newest at ${formatGameClock(newest.clock.rounds)}` : ''}. A new game starts every
        character as they were created, so the experience, treasure, and deaths of an earlier game stay in its
        saves. To play on with the characters as they were saved, continue from a save.
      </p>
      <Button variant="secondary" icon="undo" onClick={() => setOpen(true)}>
        Continue from a save
      </Button>
      <SavesDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reload();
        }}
      />
    </div>
  );
}
