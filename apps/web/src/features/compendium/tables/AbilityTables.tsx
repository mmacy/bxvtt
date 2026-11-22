import type { AbilityTables as AbilityTableSet } from '@bxvtt/shared/bxapi';
import type { RuleTable } from '@/app';
import { signed } from '@bxvtt/shared/text';
import styles from '../book.module.css';
import { formatPercentModifier, scoreRange } from '../typeset';
import { Figure, useTableSet } from './shared';

const isAbilities = (table: RuleTable): table is AbilityTableSet => 'strength' in table;

interface Column<Row> {
  header: string;
  cell: (row: Row) => string;
}

function ScoreTable<Row extends { min_score: number; max_score: number }>({
  title,
  id,
  rows,
  columns,
  note,
}: {
  title: string;
  id: string;
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  note?: string;
}) {
  return (
    <Figure title={title} id={id} note={note} className={styles.halfFigure}>
      <table className={styles.ruleTable}>
        <caption className="visually-hidden">{title} table</caption>
        <thead>
          <tr>
            <th scope="col">Score</th>
            {columns.map((column) => (
              <th key={column.header} scope="col" className={styles.num}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.min_score}>
              <th scope="row">{scoreRange(row.min_score, row.max_score)}</th>
              {columns.map((column) => (
                <td key={column.header} className={styles.num}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
  );
}

const literacy: Record<string, string> = { illiterate: 'Illiterate', basic: 'Basic', literate: 'Literate' };

/** The ability score tables: modifiers and what each score grants. */
export function AbilityTables() {
  return useTableSet('abilities', isAbilities, (t) => (
    <div className={styles.figureGrid}>
      <ScoreTable
        title="Strength"
        id="strength"
        rows={t.strength}
        columns={[
          { header: 'Melee attack and damage', cell: (r) => signed(r.melee) },
          { header: 'Open doors', cell: (r) => `${r.open_doors} in 6` },
        ]}
      />
      <ScoreTable
        title="Intelligence"
        id="intelligence"
        rows={t.intelligence}
        columns={[
          { header: 'Additional languages', cell: (r) => `${r.additional_languages}` },
          {
            header: 'Literacy',
            cell: (r) => `${literacy[r.literacy] ?? r.literacy}${r.broken_speech ? ', broken speech' : ''}`,
          },
        ]}
      />
      <ScoreTable
        title="Wisdom"
        id="wisdom"
        rows={t.wisdom}
        columns={[{ header: 'Saving throws against magic', cell: (r) => signed(r.magic_saves) }]}
      />
      <ScoreTable
        title="Dexterity"
        id="dexterity"
        rows={t.dexterity}
        columns={[
          { header: 'Armour class', cell: (r) => signed(r.ac) },
          { header: 'Missile attacks', cell: (r) => signed(r.missile) },
          { header: 'Initiative', cell: (r) => signed(r.initiative) },
        ]}
      />
      <ScoreTable
        title="Constitution"
        id="constitution"
        rows={t.constitution}
        columns={[{ header: 'Hit points per die', cell: (r) => signed(r.hit_points) }]}
      />
      <ScoreTable
        title="Charisma"
        id="charisma"
        rows={t.charisma}
        columns={[
          { header: 'Reaction roll', cell: (r) => signed(r.npc_reactions) },
          { header: 'Maximum retainers', cell: (r) => `${r.max_retainers}` },
          { header: 'Retainer loyalty', cell: (r) => `${r.retainer_loyalty}` },
        ]}
      />
      <ScoreTable
        title="Prime requisite experience"
        id="prime-requisite"
        rows={t.prime_requisite}
        columns={[{ header: 'Experience modifier', cell: (r) => formatPercentModifier(r.xp_modifier_pct) }]}
        note="For a class with one prime requisite. A class with two lists its own modifiers on its page."
      />
    </div>
  ));
}
