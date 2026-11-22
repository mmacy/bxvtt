import type { CombatTables as CombatTableSet } from '@bxvtt/shared/bxapi';
import { useRuleTable, type RuleTable } from '@/app';
import { formatInteger, saveLabel, signed } from '@bxvtt/shared/text';
import { CatalogProblem, PageSkeleton } from '../Frame';
import { ScrollTable } from '../Parts';
import styles from '../book.module.css';
import { Figure, cellText, useTableSet } from './shared';

const isCombat = (table: RuleTable): table is CombatTableSet => 'attack_matrix' in table;

const SAVES = ['death', 'wands', 'paralysis', 'breath', 'spells'] as const;

/**
 * Orders the undead hit dice columns as printed: `1`, `2`, `2*`, `3`, and so on. A JavaScript object lists
 * integer-like keys first, which would put `2*` after `6`.
 */
export function sortTurningColumns(columns: readonly string[]): string[] {
  const rank = (column: string) => Number.parseInt(column, 10) + (column.includes('*') ? 0.5 : 0);
  return [...columns].sort((a, b) => rank(a) - rank(b));
}

function TurningLegend() {
  return (
    <p className={styles.legend}>
      A number is the 2d6 roll needed to turn the undead. <strong>T</strong> turns them without a roll,{' '}
      <strong>D</strong> destroys them without a roll, and the dash means the cleric cannot turn them. Columns
      are the undead&rsquo;s hit dice, and an asterisk marks a special ability.
    </p>
  );
}

function TurningRows({ table }: { table: CombatTableSet }) {
  const rows = table.turning.rows;
  const columns = sortTurningColumns(Object.keys(rows[0]?.cells ?? {}));
  return (
    <table className={styles.ruleTable}>
      <caption className="visually-hidden">Turning undead, by cleric level and undead hit dice</caption>
      <thead>
        <tr>
          <th scope="col" rowSpan={2}>
            Cleric level
          </th>
          <th scope="colgroup" colSpan={columns.length} className={styles.group}>
            Undead hit dice
          </th>
        </tr>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col" className={styles.num}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {columns.map((column) => {
              const value = row.cells[column] ?? '—';
              return (
                <td
                  key={column}
                  className={`${styles.num} ${value === 'T' ? styles.turned : ''} ${value === 'D' ? styles.destroyed : ''}`}
                  title={value === 'T' ? 'Turned' : value === 'D' ? 'Destroyed' : undefined}
                >
                  {cellText(value)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The turning undead table, on its own for the cleric's page. */
export function TurningTable() {
  const result = useRuleTable('combat');
  if (result.data !== null && isCombat(result.data)) {
    return (
      <>
        <ScrollTable label="Turning undead">
          <TurningRows table={result.data} />
        </ScrollTable>
        <TurningLegend />
      </>
    );
  }
  if (result.error !== null)
    return <CatalogProblem title="Couldn't load the turning table" result={result} />;
  return <PageSkeleton label="Loading the turning table" />;
}

/** The combat tables: attack matrix, saving throws, turning undead, reactions, and experience awards. */
export function CombatTables() {
  return useTableSet('combat', isCombat, (t) => {
    const acColumns = Object.keys(t.attack_matrix.rows[0]?.by_ac ?? {}).sort((a, b) => Number(a) - Number(b));
    return (
      <>
        <Figure
          title="Attack matrix"
          id="attack-matrix"
          note="The d20 roll an attacker needs, by the attacker's hit dice and the target's armour class."
        >
          <table className={styles.ruleTable}>
            <caption className="visually-hidden">
              Attack matrix: the roll needed against each armour class
            </caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>
                  Attacker&rsquo;s hit dice
                </th>
                <th scope="col" rowSpan={2} className={styles.num}>
                  THAC0
                </th>
                <th scope="col" rowSpan={2} className={styles.num}>
                  Attack bonus
                </th>
                <th scope="colgroup" colSpan={acColumns.length} className={styles.group}>
                  Target armour class
                </th>
              </tr>
              <tr>
                {acColumns.map((ac) => (
                  <th key={ac} scope="col" className={styles.num}>
                    {ac}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.attack_matrix.rows.map((row) => (
                <tr key={row.hd_label}>
                  <th scope="row">{row.hd_label}</th>
                  <td className={styles.num}>{row.thac0}</td>
                  <td className={styles.num}>{signed(row.attack_bonus)}</td>
                  {acColumns.map((ac) => (
                    <td key={ac} className={styles.num}>
                      {row.by_ac[ac]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Figure>

        <Figure
          title="Monster saving throws"
          id="saving-throws"
          note="A save succeeds on a d20 roll equal to or higher than the number."
        >
          <table className={styles.ruleTable}>
            <caption className="visually-hidden">Monster saving throws by hit dice</caption>
            <thead>
              <tr>
                <th scope="col">Hit dice</th>
                {SAVES.map((save) => (
                  <th key={save} scope="col" className={styles.num} title={saveLabel(save)}>
                    {saveLabel(save, 'short')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.monster_saves.map((band) => (
                <tr key={band.label}>
                  <th scope="row">{band.label}</th>
                  {SAVES.map((save) => (
                    <td key={save} className={styles.num}>
                      {band.saves[save]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Figure>

        <Figure title="Turning undead" id="turning" note={<TurningLegend />}>
          <TurningRows table={t} />
        </Figure>

        <Figure
          title="Monster reactions"
          id="reaction"
          note="Roll 2d6, add the Charisma modifier, and read the band."
        >
          <table className={styles.ruleTable}>
            <caption className="visually-hidden">Monster reaction by 2d6 roll</caption>
            <thead>
              <tr>
                <th scope="col">2d6 roll</th>
                <th scope="col">Reaction</th>
              </tr>
            </thead>
            <tbody>
              {t.reaction.bands.map((band) => (
                <tr key={band.label}>
                  <th scope="row">{band.label}</th>
                  <td>{band.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Figure>

        <Figure
          title="Monster experience awards"
          id="xp-awards"
          note="Experience for defeating one monster, by hit dice, with the bonus for each asterisk."
        >
          <table className={styles.ruleTable}>
            <caption className="visually-hidden">Experience points by monster hit dice</caption>
            <thead>
              <tr>
                <th scope="col">Hit dice</th>
                <th scope="col" className={styles.num}>
                  Base experience
                </th>
                <th scope="col" className={styles.num}>
                  Per special ability
                </th>
              </tr>
            </thead>
            <tbody>
              {t.xp_awards.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={styles.num}>{formatInteger(row.base)}</td>
                  <td className={styles.num}>{formatInteger(row.bonus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Figure>
      </>
    );
  });
}
