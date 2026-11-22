import type { StoredCharacter } from '@bxvtt/shared/protocol';
import { capitalizeFirst, ordinal, prettifyId, spellCatalogName } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useRulesEntry, useSpellCatalog, type ClassDetail } from '@/app';
import { CoinPurse, Parchment } from '@/ui';
import { ItemDetailButton } from './ItemDetail';
import { equippedEntries, sheetFromStored, type InventoryEntry, type SheetModel } from './model';
import {
  AbilityScores,
  Conditions,
  Languages,
  SavingThrows,
  ScoreModifiers,
  SheetHeader,
  ThiefSkills,
  VitalsRow,
  XpProgress,
} from './SheetSections';
import styles from './sheet.module.css';

const SLOT_LABELS: Record<string, string> = {
  armour: 'Worn',
  shield: 'Shield',
  wielded: 'Wielded',
  ring: 'Ring',
  pack: 'Pack',
};

function EntryList({ entries }: { entries: InventoryEntry[] }) {
  return (
    <ul className={styles.items}>
      {entries.map((entry) => (
        <li key={entry.key} className={styles.itemRow}>
          <span className={styles.itemMain}>
            <span className={styles.itemName}>{entry.name}</span>
            {entry.slot !== 'pack' && <span className={styles.itemFacts}>{SLOT_LABELS[entry.slot]}</span>}
          </span>
          {entry.quantity > 1 && <span className={styles.qty}>{entry.quantity}</span>}
          <span className={styles.itemActions}>
            <ItemDetailButton entry={entry} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A read-only inventory: what the character wears, wields, and carries. */
export function ReadOnlyInventory({ model }: { model: SheetModel }) {
  const equipped = equippedEntries(model.inventory);
  const carried = [...model.inventory.pack, ...model.inventory.valuables];
  return (
    <section className={styles.section} aria-labelledby="stored-gear">
      <h3 id="stored-gear" className={styles.sectionTitle}>
        Equipment
      </h3>
      {equipped.length + carried.length === 0 ? (
        <p className={styles.muted}>No equipment. The party can shop in town once the game starts.</p>
      ) : (
        <EntryList entries={[...equipped, ...carried]} />
      )}
      <CoinPurse coins={model.inventory.purse} />
    </section>
  );
}

/** A read-only list of spells in the book and in memory. */
function ReadOnlySpells({ model }: { model: SheetModel }) {
  const catalog = useSpellCatalog();
  if (model.spellBook.length === 0 && model.memorized.length === 0) return null;
  const name = (id: string) =>
    catalog.data?.find((s) => s.id === id)?.name ?? spellCatalogName(id) ?? capitalizeFirst(prettifyId(id));
  const level = (id: string) => catalog.data?.find((s) => s.id === id)?.level;
  return (
    <section className={styles.section} aria-labelledby="stored-spells">
      <h3 id="stored-spells" className={styles.sectionTitle}>
        Spell book
      </h3>
      <ul className={styles.items}>
        {model.spellBook.map((id) => (
          <li key={id} className={styles.itemRow}>
            <span className={styles.itemMain}>
              <span className={styles.itemName}>{name(id)}</span>
              {level(id) !== undefined && (
                <span className={styles.itemFacts}>{ordinal(level(id) ?? 1)} level</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The full sheet of a stored character on parchment, from its document and the values bxapi derives. It has no
 * actions: a stored character changes only in a game.
 */
export function StoredSheet({ character, color }: { character: StoredCharacter; color?: string }) {
  const classEntry = useRulesEntry<ClassDetail>(`classes/${character.class_id}`);
  const model = useMemo(() => {
    const progression = classEntry.data?.progression;
    const next = progression?.find((row) => row.level === character.level + 1);
    const sheet = sheetFromStored(character, progression ? (next?.xp ?? null) : undefined);
    const skills = classEntry.data?.thief_skills.find((row) => row.level === character.level);
    if (skills) {
      const { level: _level, ...rest } = skills;
      sheet.thiefSkills = Object.fromEntries(
        Object.entries(rest).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
      );
    }
    return sheet;
  }, [character, classEntry.data]);
  return (
    <Parchment variant="plain" className={styles.sheetPaper}>
      <SheetHeader model={model} color={color} />
      <VitalsRow model={model} />
      <XpProgress model={model} />
      <Conditions conditions={model.conditions} compact />
      <AbilityScores model={model} />
      <div className={styles.columns}>
        <div className={styles.column}>
          <ScoreModifiers model={model} />
          <ThiefSkills skills={model.thiefSkills} />
          <ReadOnlyInventory model={model} />
        </div>
        <div className={styles.column}>
          <SavingThrows model={model} />
          <Languages languages={model.languages} />
          <ReadOnlySpells model={model} />
        </div>
      </div>
    </Parchment>
  );
}
