import type { ReactNode } from 'react';
import { classLabel } from '@bxvtt/shared/text';
import { tokenClass } from '@/app';
import { Card, TokenPortrait } from '@/ui';
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
export function StoredCharacterCard({ summary, owner, actions }: StoredCharacterCardProps) {
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
        <p className={styles.name}>{summary.name}</p>
        <p className={styles.meta}>
          Level {summary.level} {classLabel(summary.class_id).toLowerCase()}
          {owner ? <span className={styles.owner}> · {owner.name}</span> : null}
        </p>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </Card>
  );
}
