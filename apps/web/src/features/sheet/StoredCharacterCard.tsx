import { classLabel } from '@bxvtt/shared/text';
import { useState, type ReactNode } from 'react';
import { getApi, tokenClass, useApiAction, useMyCharacters, useStoredCharacter } from '@/app';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  IconButton,
  Skeleton,
  TokenPortrait,
  toast,
} from '@/ui';
import { RuleLinksContext } from './RuleLink';
import { describeFailure } from '../wizard/server';
import { StoredSheet } from './StoredSheet';
import sheetStyles from './sheet.module.css';
import styles from './StoredCharacterCard.module.css';

export interface StoredCharacterCardProps {
  /** The stored character's ID (`chr_...`). Load the full character with `useStoredCharacter(characterId)`. */
  characterId: string;
  /** What the roster or the character list already knows, to show before anything loads. */
  summary: { name: string; class_id: string; level: number };
  /** The player who owns the character, shown on roster cards. */
  owner?: { name: string; color: string } | null;
  /** Controls the lobby puts on the card, such as reorder and remove buttons. */
  actions?: ReactNode;
}

/** A stored character in the lobby: on the roster, or in the user's list of characters to add. */
export function StoredCharacterCard({ characterId, summary, owner, actions }: StoredCharacterCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <Card padding="sm" className={styles.card}>
      <TokenPortrait
        name={summary.name}
        characterClass={tokenClass(summary.class_id)}
        color={owner?.color}
        size={40}
        decorative
      />
      <div className={styles.text}>
        <button type="button" className={styles.nameButton} onClick={() => setOpen(true)}>
          <span className={styles.name}>{summary.name}</span>
          <span className="visually-hidden">, open the character sheet</span>
        </button>
        <p className={styles.meta}>
          <span>
            Level {summary.level} {classLabel(summary.class_id).toLowerCase()}
          </span>
          {owner ? (
            <span className={styles.owner}>
              <span className="visually-hidden">, played by</span> {owner.name}
            </span>
          ) : null}
        </p>
      </div>
      <div className={styles.actions}>
        <IconButton
          icon="scroll"
          label={`Open ${summary.name}'s sheet`}
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
        />
        {actions}
      </div>
      <StoredSheetDrawer
        characterId={open ? characterId : null}
        name={summary.name}
        color={owner?.color}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}

interface DrawerProps {
  characterId: string | null;
  name: string;
  color?: string;
  onClose: () => void;
}

/** A stored character's sheet in a drawer, with delete for its owner. */
function StoredSheetDrawer({ characterId, name, color, onClose }: DrawerProps) {
  const { data, loading, error } = useStoredCharacter(characterId);
  const mine = useMyCharacters();
  const { run } = useApiAction();
  const [confirming, setConfirming] = useState(false);
  const owned = characterId !== null && (mine.items ?? []).some((c) => c.id === characterId);

  const remove = async () => {
    if (characterId === null) return;
    let failure: unknown = null;
    const result = await run(
      () =>
        getApi()
          .deleteCharacter(characterId)
          .catch((error: unknown) => {
            failure = error;
            throw error;
          }),
      { display: 'inline' },
    );
    if (!result.ok) {
      const message = describeFailure(failure);
      toast.error(`Couldn't delete ${name}`, { description: `${message.title}. ${message.detail}` });
      return;
    }
    if (result.ok) {
      toast.success(`${name} is gone`, { description: 'The character left every party it was in.' });
      await mine.refresh();
      onClose();
    }
  };

  return (
    <Drawer
      open={characterId !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={name}
      description="Character sheet"
      hideTitle
      width="min(700px, 96vw)"
      flush
      footer={
        owned ? (
          <div className={sheetStyles.storedFooter}>
            <span className={sheetStyles.note}>A stored character changes only in a game.</span>
            <Button variant="danger" icon="trash" size="sm" onClick={() => setConfirming(true)}>
              Delete character
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className={sheetStyles.sheetScroll}>
        {loading && <Skeleton shape="block" height={480} />}
        {error && (
          <Banner
            tone="warning"
            title={
              error.code === 'not_found'
                ? "You can't open this sheet"
                : error.code === 'server_unavailable'
                  ? "The bxvtt server isn't answering"
                  : error.title
            }
          >
            {error.code === 'not_found'
              ? "Only the character's owner and the referee of a table with this character in its party can read it."
              : error.code === 'server_unavailable'
                ? 'It may be starting or restarting. Close the sheet and open it again in a few seconds.'
                : error.detail}
          </Banner>
        )}
        {data && (
          // The lobby and the home page render the compendium, so names on a stored sheet open it.
          <RuleLinksContext.Provider value={true}>
            <StoredSheet character={data} color={color} />
          </RuleLinksContext.Provider>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${name}?`}
        description={`${name} leaves every lobby party and can't come back. Saved games keep their copy.`}
        confirmLabel="Delete character"
        tone="danger"
        onConfirm={remove}
      />
    </Drawer>
  );
}
