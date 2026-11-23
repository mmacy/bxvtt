import type { RosterEntry, StoredCharacter } from '@bxvtt/shared/protocol';
import { useMemo, useState, type DragEvent } from 'react';
import {
  getApi,
  useApiAction,
  useIsReferee,
  useMembers,
  useMyCharacters,
  useTableDetail,
  useTableStoreApi,
  useTableUser,
} from '@/app';
import { Button, EmptyState, IconButton, Skeleton, cx } from '@/ui';
import { StoredCharacterCard } from '@/features/sheet';
import { CharacterWizard } from '@/features/wizard';
import styles from './lobby.module.css';

/**
 * Moves one item of a list to another index.
 *
 * @param ids - The list.
 * @param from - The index of the item to move.
 * @param to - The index it ends up at.
 * @returns A new list.
 */
export function moveItem<T>(ids: readonly T[], from: number, to: number): T[] {
  const next = [...ids];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * The lobby roster in marching order. Owners add their characters and take them off. A referee reorders it by
 * dragging a card or with the move buttons, and can take any character off.
 */
export function RosterPanel() {
  const table = useTableDetail();
  const me = useTableUser();
  const referee = useIsReferee();
  const members = useMembers();
  const store = useTableStoreApi();
  const { run } = useApiAction();
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const roster = useMemo(() => {
    const entries = table?.roster ?? [];
    if (pendingOrder === null) return entries;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    return pendingOrder.flatMap((id) => {
      const entry = byId.get(id);
      return entry === undefined ? [] : [entry];
    });
  }, [table?.roster, pendingOrder]);

  if (table === null) return null;

  const reorder = async (ids: string[]) => {
    setPendingOrder(ids);
    const result = await run(() => getApi().reorderRoster(table.id, ids), {
      errorTitle: "Couldn't change the marching order",
    });
    if (result.ok) store.getState().receiveTable(result.value);
    setPendingOrder(null);
  };

  const move = (index: number, to: number) => {
    if (to < 0 || to >= roster.length) return;
    void reorder(
      moveItem(
        roster.map((e) => e.id),
        index,
        to,
      ),
    );
  };

  const remove = async (entry: RosterEntry) => {
    const result = await run(() => getApi().removeFromRoster(table.id, entry.id), {
      errorTitle: `Couldn't remove ${entry.name} from the party`,
    });
    if (result.ok) store.getState().receiveTable(result.value);
  };

  const onDragStart = (event: DragEvent, id: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDragging(id);
  };
  const onDragOver = (event: DragEvent, index: number) => {
    if (dragging === null) return;
    event.preventDefault();
    setDropIndex(index);
  };
  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    const from = roster.findIndex((entry) => entry.id === dragging);
    setDragging(null);
    setDropIndex(null);
    if (from === -1 || from === index) return;
    void reorder(
      moveItem(
        roster.map((e) => e.id),
        from,
        index,
      ),
    );
  };

  return (
    <div className={styles.roster}>
      {roster.length === 0 ? (
        <EmptyState
          icon="users"
          size="compact"
          title="The party is empty"
          description="Add an existing character or create a new one. Their order here sets the marching order."
        />
      ) : (
        <ol className={styles.rosterList} aria-label="Party in marching order">
          {roster.map((entry, index) => {
            const owner = members.find((m) => m.user_id === entry.owner_user_id) ?? null;
            const mine = entry.owner_user_id === me?.id;
            return (
              <li
                key={entry.id}
                className={cx(
                  styles.rosterItem,
                  dragging === entry.id && styles.dragging,
                  dropIndex === index && dragging !== entry.id && styles.dropTarget,
                )}
                draggable={referee}
                onDragStart={(event) => onDragStart(event, entry.id)}
                onDragOver={(event) => onDragOver(event, index)}
                onDragLeave={() => setDropIndex(null)}
                onDrop={(event) => onDrop(event, index)}
                onDragEnd={() => {
                  setDragging(null);
                  setDropIndex(null);
                }}
              >
                <span className={styles.rank} aria-hidden="true">
                  {index + 1}
                </span>
                <div className={styles.grow}>
                  <StoredCharacterCard
                    characterId={entry.character_id}
                    summary={entry}
                    owner={
                      owner ? { name: mine ? `${owner.name} (you)` : owner.name, color: owner.color } : null
                    }
                    actions={
                      <>
                        {referee && (
                          <>
                            <IconButton
                              icon="arrow-up"
                              label={`Move ${entry.name} forward`}
                              variant="ghost"
                              size="sm"
                              disabled={index === 0 || pendingOrder !== null}
                              onClick={() => move(index, index - 1)}
                            />
                            <IconButton
                              icon="arrow-down"
                              label={`Move ${entry.name} back`}
                              variant="ghost"
                              size="sm"
                              disabled={index === roster.length - 1 || pendingOrder !== null}
                              onClick={() => move(index, index + 1)}
                            />
                          </>
                        )}
                        {(mine || referee) && (
                          <IconButton
                            icon="close"
                            label={`Remove ${entry.name} from party`}
                            variant="ghost"
                            size="sm"
                            onClick={() => void remove(entry)}
                          />
                        )}
                      </>
                    }
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {referee && roster.length > 1 && (
        <p className={styles.note}>
          Drag cards or use the arrows to set the marching order. Rank 1 leads the party.
        </p>
      )}
      <MyCharacters />
    </div>
  );
}

/** The user's stored characters that aren't on the roster, with the character wizard. */
function MyCharacters() {
  const table = useTableDetail();
  const store = useTableStoreApi();
  const { items, loading, error, refresh } = useMyCharacters();
  const { run } = useApiAction();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  if (table === null) return null;
  const onRoster = new Set(table.roster.map((entry) => entry.character_id));
  const available = (items ?? []).filter((character) => !onRoster.has(character.id));

  const add = async (characterId: string, name: string) => {
    setAdding(characterId);
    const result = await run(() => getApi().addToRoster(table.id, characterId), {
      errorTitle: `Couldn't add ${name} to the party`,
    });
    if (result.ok) store.getState().receiveTable(result.value);
    setAdding(null);
  };

  // The wizard's success view already says the character is ready, so no toast covers it.
  const onCreated = (character: StoredCharacter) => {
    void refresh();
    void add(character.id, character.name);
  };

  return (
    <section className={styles.mine} aria-labelledby="my-characters">
      <div className={styles.mineHeader}>
        <h3 id="my-characters" className={styles.subTitle}>
          Your characters
        </h3>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => setWizardOpen(true)}>
          Create a character
        </Button>
      </div>
      {loading && items === null && <Skeleton shape="block" height={56} />}
      {error !== null && (
        <p className={styles.note}>
          {error.title}. {error.detail}
        </p>
      )}
      {items !== null && available.length === 0 && (
        <p className={styles.note}>
          {items.length === 0
            ? "You haven't created any characters yet. Create one to add them to the party."
            : 'All of your characters are already in the party.'}
        </p>
      )}
      {available.length > 0 && (
        <ul className={styles.mineList}>
          {available.map((character) => (
            <li key={character.id}>
              <StoredCharacterCard
                characterId={character.id}
                summary={character}
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="plus"
                    loading={adding === character.id}
                    onClick={() => void add(character.id, character.name)}
                  >
                    Add to party
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <CharacterWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={onCreated} />
    </section>
  );
}
