import type { EncounterTables as EncounterTableSet } from '@bxvtt/shared/bxapi';
import { useMonsterCatalog, type RuleTable } from '@/app';
import { alignmentLabel, classLabel, formatDice } from '@bxvtt/shared/text';
import { SegmentedControl } from '@/ui';
import { useState } from 'react';
import { EntryLink, Inline } from '../Parts';
import styles from '../book.module.css';
import { titleFromId } from '../model';
import { Figure, useTableSet } from './shared';

const isEncounters = (table: RuleTable): table is EncounterTableSet => 'npc_class_levels' in table;

function levelLabel(min: number, max: number | null | undefined): string {
  if (max === null || max === undefined) return `${min}+`;
  return min === max ? `${min}` : `${min}-${max}`;
}

/** The wandering monster tables by dungeon level, and the tables for non-player adventurers. */
export function EncounterTables() {
  const monsters = useMonsterCatalog();
  const [level, setLevel] = useState<string | null>(null);
  const monsterName = (id: string) => monsters.data?.find((m) => m.id === id)?.name ?? titleFromId(id);
  return useTableSet('encounters', isEncounters, (t) => {
    const active = t.tables.find((table) => table.id === level) ?? t.tables[0];
    return (
      <>
        <Figure
          title="Wandering monsters"
          id="wandering"
          note="Roll a d20 on the table for the dungeon level. The number appearing here replaces the monster's own."
        >
          <div className={styles.tableControls}>
            <SegmentedControl
              aria-label="Dungeon level"
              size="sm"
              value={active?.id ?? ''}
              onValueChange={setLevel}
              options={t.tables.map((table) => ({
                value: table.id,
                label: `Level ${levelLabel(table.min_level, table.max_level)}`,
              }))}
            />
          </div>
          {active && (
            <table className={styles.ruleTable}>
              <caption className="visually-hidden">
                Wandering monsters on dungeon level {levelLabel(active.min_level, active.max_level)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">d20</th>
                  <th scope="col">Encounter</th>
                  <th scope="col" className={styles.num}>
                    Number appearing
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.rows.map((row) => {
                  const entry = row.entry;
                  const first = entry.kind === 'monster' ? entry.monster_ids[0] : undefined;
                  const forms = entry.kind === 'monster' ? entry.monster_ids : [];
                  return (
                    <tr key={row.roll}>
                      <th scope="row">{row.roll}</th>
                      <td>
                        {entry.kind === 'npc_party' ? (
                          <EntryLink kind="tables" id="encounters" anchor="npc-parties">
                            {row.name}
                          </EntryLink>
                        ) : forms.length === 1 && first ? (
                          <EntryLink kind="monsters" id={first}>
                            {row.name}
                          </EntryLink>
                        ) : (
                          <>
                            {row.name}
                            <span className={styles.statNote}>
                              {entry.kind === 'monster' && entry.variant_dice
                                ? `Roll ${formatDice(entry.variant_dice)} once for the whole group. Forms: `
                                : 'Forms: '}
                              <Inline
                                items={forms.map((id) => (
                                  <EntryLink key={id} kind="monsters" id={id}>
                                    {monsterName(id)}
                                  </EntryLink>
                                ))}
                              />
                            </span>
                          </>
                        )}
                      </td>
                      <td className={styles.num}>
                        {row.count_dice ? formatDice(row.count_dice) : row.count_fixed}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Figure>

        <Figure
          title="Non-player adventurers"
          id="npc-parties"
          note="Roll a d8 for each member's class and level, and a d6 for the party's alignment."
        >
          <table className={styles.ruleTable}>
            <caption className="visually-hidden">Class and level of a non-player adventurer</caption>
            <thead>
              <tr>
                <th scope="col">d8</th>
                <th scope="col">Class</th>
                <th scope="col" className={styles.num}>
                  Basic party level
                </th>
                <th scope="col" className={styles.num}>
                  Expert party level
                </th>
              </tr>
            </thead>
            <tbody>
              {t.npc_class_levels.map((row) => (
                <tr key={row.roll}>
                  <th scope="row">{row.roll}</th>
                  <td>
                    <EntryLink kind="classes" id={row.class_id}>
                      {classLabel(row.class_id)}
                    </EntryLink>
                  </td>
                  <td className={styles.num}>{formatDice(row.basic_dice)}</td>
                  <td className={styles.num}>{formatDice(row.expert_dice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.splitTables}>
            <table className={styles.ruleTable}>
              <caption className="visually-hidden">Alignment of a non-player party</caption>
              <thead>
                <tr>
                  <th scope="col">d6</th>
                  <th scope="col">Alignment</th>
                </tr>
              </thead>
              <tbody>
                {t.npc_alignment.map((band) => (
                  <tr key={band.roll_min}>
                    <th scope="row">
                      {band.roll_min === band.roll_max ? band.roll_min : `${band.roll_min}-${band.roll_max}`}
                    </th>
                    <td>{alignmentLabel(band.alignment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className={styles.ruleTable}>
              <caption className="visually-hidden">Size of a non-player party</caption>
              <thead>
                <tr>
                  <th scope="col">Party</th>
                  <th scope="col" className={styles.num}>
                    Members
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.npc_compositions.map((row) => (
                  <tr key={row.kind}>
                    <th scope="row">{titleFromId(row.kind)}</th>
                    <td className={styles.num}>{formatDice(row.count_dice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Figure>
      </>
    );
  });
}
