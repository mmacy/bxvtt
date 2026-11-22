import type { TreasureEntry, TreasureTables as TreasureTableSet } from '@bxvtt/shared/bxapi';
import type { RuleTable } from '@/app';
import { formatDice, formatGold } from '@bxvtt/shared/text';
import { SectionLink } from '../Parts';
import styles from '../book.module.css';
import { anchorId, titleFromId } from '../model';
import { chanceInSix, magicItemTypeLabel, treasureEntryText } from '../typeset';
import { Figure, useTableSet } from './shared';

const isTreasure = (table: RuleTable): table is TreasureTableSet => 'treasure_types' in table;

const SECTION_LABELS: Record<string, string> = {
  hoard: 'Lair',
  individual: 'Each creature',
  group: 'Whole group',
};

/** The lines of a treasure type or hoard, each with its chance. */
export function TreasureLines({ entries }: { entries: readonly TreasureEntry[] }) {
  return (
    <ul className={styles.treasureLines}>
      {entries.map((entry, index) => {
        const { chance, text } = treasureEntryText(entry);
        return (
          <li key={index}>
            <span className={styles.chance}>{chance}</span>
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function range(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`;
}

/** The treasure tables: treasure types, gems, magic item types, room stocking, and unguarded treasure. */
export function TreasureTables() {
  return useTableSet('treasure', isTreasure, (t) => (
    <>
      <Figure
        title="Treasure types"
        id="treasure-types"
        note="Each line has its own chance of being present. Lair treasure is generated once for a lair, the other types for each creature or for the whole group."
      >
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">Treasure types A to V</caption>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Carried by</th>
              <th scope="col" className={styles.num}>
                Average value
              </th>
              <th scope="col">Contents</th>
            </tr>
          </thead>
          <tbody>
            {t.treasure_types.map((type) => (
              <tr key={type.letter} id={anchorId(`type-${type.letter}`)} data-anchor={`type-${type.letter}`}>
                <th scope="row" className={styles.letter}>
                  {type.letter}
                </th>
                <td>{SECTION_LABELS[type.kind] ?? titleFromId(type.kind)}</td>
                <td className={styles.num}>{formatGold(Math.round(type.average_gp))}</td>
                <td>
                  <TreasureLines entries={type.entries} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Figure>

      <Figure title="Gems and jewellery" id="gems" note="Roll a d20 for the value of each gem.">
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">Gem values by d20 roll</caption>
          <thead>
            <tr>
              <th scope="col">d20</th>
              <th scope="col" className={styles.num}>
                Value of one gem
              </th>
            </tr>
          </thead>
          <tbody>
            {t.gems.bands.map((band) => (
              <tr key={band.roll_min}>
                <th scope="row">{range(band.roll_min, band.roll_max)}</th>
                <td className={styles.num}>{formatGold(band.value_gp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.footnote}>
          One piece of jewellery is worth {formatDice(t.gems.jewellery_dice)} gp.
        </p>
        {t.gems.manual_notes.map((note) => (
          <p key={note} className={styles.footnote}>
            {note}
          </p>
        ))}
      </Figure>

      <Figure
        title="Magic item types"
        id="magic-item-types"
        note="Roll d% to learn what kind of magic item a hoard holds. The Basic column is for Basic play and the Expert column for Expert play."
      >
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">Magic item type by d% roll</caption>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col" className={styles.num}>
                Basic
              </th>
              <th scope="col" className={styles.num}>
                Expert
              </th>
            </tr>
          </thead>
          <tbody>
            {t.magic_item_types.rows.map((row) => (
              <tr key={row.category}>
                <th scope="row">{magicItemTypeLabel(row.category)}</th>
                <td className={styles.num}>{range(row.basic_min, row.basic_max)}</td>
                <td className={styles.num}>{range(row.expert_min, row.expert_max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.footnote}>
          <SectionLink section="magic-items">Browse the magic items</SectionLink>
        </p>
      </Figure>

      <Figure
        title="Room stocking"
        id="stocking"
        note="Roll a d6 for what a dungeon room holds, then a d6 for treasure."
      >
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">What a dungeon room holds</caption>
          <thead>
            <tr>
              <th scope="col">d6</th>
              <th scope="col">Contents</th>
              <th scope="col" className={styles.num}>
                Treasure chance
              </th>
            </tr>
          </thead>
          <tbody>
            {t.stocking.rows.map((row) => (
              <tr key={row.roll_min}>
                <th scope="row">{range(row.roll_min, row.roll_max)}</th>
                <td>{titleFromId(row.contents)}</td>
                <td className={styles.num}>
                  {row.treasure_chance_in_six > 0 ? chanceInSix(row.treasure_chance_in_six) : 'No roll'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Figure>

      <Figure
        title="Unguarded treasure"
        id="unguarded"
        note="What a cache with no monsters guarding it holds, by dungeon level."
      >
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">Unguarded treasure by dungeon level</caption>
          <thead>
            <tr>
              <th scope="col">Dungeon level</th>
              <th scope="col">Contents</th>
            </tr>
          </thead>
          <tbody>
            {t.unguarded.bands.map((band) => (
              <tr key={band.min_level}>
                <th scope="row">
                  {band.max_level === null || band.max_level === undefined
                    ? `${band.min_level}+`
                    : range(band.min_level, band.max_level)}
                </th>
                <td>
                  <TreasureLines entries={band.entries} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Figure>
    </>
  ));
}
