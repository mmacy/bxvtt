import { classLabel } from '@bxvtt/shared/text';
import { useState, type ReactNode } from 'react';
import { getApi, tokenClass, useApiAction, useMyCharacters, useStoredCharacter } from '@/app';
import { Banner, Button, Card, ConfirmDialog, Drawer, Skeleton, TokenPortrait, Tooltip, toast } from '@/ui';
import { RuleLinksContext } from './RuleLink';
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
        <Tooltip content="Open the character sheet">
          <button type="button" className={styles.nameButton} onClick={() => setOpen(true)}>
            <span className={styles.name}>{summary.name}</span>
          </button>
        </Tooltip>
        <p className={styles.meta}>
          <span>
            Level {summary.level} {classLabel(summary.class_id).toLowerCase()}
            {owner ? <span className="visually-hidden-inline">,</span> : null}
          </span>
          {owner ? (
            <span className={styles.owner}>
              <span className="visually-hidden-inline">played by </span>
              {owner.name}
            </span>
          ) : null}
        </p>
      </div>
      <div className={styles.actions}>{actions}</div>
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
    const result = await run(() => getApi().deleteCharacter(characterId), {
      errorTitle: `Couldn't delete ${name}`,
    });
    if (result.ok) {
      toast.success(`Deleted ${name}`, { description: 'Removed from every party.' });
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
            <span className={sheetStyles.note}>Characters only change during an active game.</span>
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
            title={error.code === 'not_found' ? "You can't open this sheet" : error.title}
          >
            {error.code === 'not_found'
              ? "Only the character's owner or the table's referee can view this sheet."
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
        description={`This removes ${name} from every lobby party and cannot be undone. Saved games keep their copy.`}
        confirmLabel="Delete character"
        tone="danger"
        onConfirm={remove}
      />
    </Drawer>
  );
}
