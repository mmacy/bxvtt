import type { RangeBand } from '@bxvtt/shared/bxapi';
import {
  formatDice,
  formatInteger,
  itemTypeLabel,
  signed,
  weaponQualityDescription,
  weaponQualityLabel,
} from '@bxvtt/shared/text';
import { Badge } from '@/ui';
import { useEntry } from '../catalogs';
import { EntryFrame } from '../Frame';
import { EntryPage, Stat } from '../Parts';
import styles from '../book.module.css';
import { titleFromId } from '../model';
import { formatArmourClass, formatCost, formatWeight, isNumber } from '../typeset';

/** The qualities of a weapon, each with what it means. */
function Qualities({ qualities }: { qualities: readonly string[] }) {
  return (
    <ul className={styles.qualityList}>
      {qualities.map((quality) => (
        <li key={quality}>
          <strong>{weaponQualityLabel(quality)}</strong>
          <span>{weaponQualityDescription(quality)}</span>
        </li>
      ))}
    </ul>
  );
}

const PARAM_LABELS: Record<string, (value: unknown) => [string, string] | null> = {
  burn_turns: (v) => ['Burns', `${v} turns`],
  burn_turns_per_flask: (v) => ['Burns', `${v} turns for each flask of oil`],
  light_radius_feet: (v) => ['Light radius', `${v}'`],
  light_chance_in_six: (v) => ['Chance to light', `${v} in 6`],
  required_for: (v) => ['Needed to', titleFromId(String(v)).toLowerCase()],
  brightness: (v) => ['Light', titleFromId(String(v)).toLowerCase()],
  ration: (v) => (v === true ? ['Use', 'Food for a day for each ration'] : null),
};

/** Labels the free-form `params` of a gear item. A parameter the book doesn't know reads as its own name. */
export function paramRows(params: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    const known = PARAM_LABELS[key]?.(value);
    if (known) rows.push(known);
    else if (PARAM_LABELS[key]) continue;
    else if (typeof value === 'boolean') {
      if (value) rows.push([titleFromId(key), 'Yes']);
    } else if (typeof value === 'number') rows.push([titleFromId(key), formatInteger(value)]);
    else if (typeof value === 'string') rows.push([titleFromId(key), titleFromId(value).toLowerCase()]);
  }
  return rows;
}

function Ranges({ ranges }: { ranges: { short: RangeBand; medium: RangeBand; long: RangeBand } }) {
  return (
    <ul className={styles.rangeList}>
      {(['short', 'medium', 'long'] as const).map((band) => (
        <li key={band}>
          <span className={styles.rangeName}>{titleFromId(band)}</span>
          <span className={styles.big}>
            {ranges[band].min_feet}&rsquo;-{ranges[band].max_feet}&rsquo;
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A weapon, a suit of armour, gear, or ammunition, with every field the catalog states. */
export function EquipmentEntry({ id }: { id: string }) {
  const result = useEntry('equipment', id);
  return (
    <EntryFrame result={result} label="this item" section="equipment">
      {(item) => (
        <EntryPage
          kicker={itemTypeLabel(item.item_type)}
          title={item.name}
          badges={
            'material' in item && item.material === 'silver' ? <Badge tone="info">Silver</Badge> : undefined
          }
        >
          <section className={styles.factSheet} aria-label="Item facts">
            <dl className={styles.statGrid}>
              <Stat label="Cost">
                <span className={styles.big}>{formatCost(item.cost_gp)}</span>
                {'lot_size' in item && item.lot_size > 1 && (
                  <span className={styles.statNote}>for {item.lot_size}</span>
                )}
              </Stat>
              {'weight_coins' in item && (item.item_type !== 'ammunition' || item.weight_coins > 0) && (
                <Stat label="Weight">{formatWeight(item.weight_coins)}</Stat>
              )}
              {item.item_type === 'weapon' && (
                <>
                  <Stat label="Damage">
                    <span className={styles.big}>{formatDice(item.damage)}</span>
                  </Stat>
                  <Stat label="Qualities" span="full">
                    <Qualities qualities={item.qualities} />
                  </Stat>
                  {item.missile_ranges && (
                    <Stat label="Range" span="full">
                      <Ranges ranges={item.missile_ranges} />
                    </Stat>
                  )}
                </>
              )}
              {item.item_type === 'armour' && (
                <>
                  {isNumber(item.ac) && (
                    <Stat label="Armour class">
                      <span className={styles.big}>{formatArmourClass(item.ac, item.ac_ascending)}</span>
                    </Stat>
                  )}
                  {isNumber(item.ac_bonus) && (
                    <Stat label="Armour class bonus">
                      <span className={styles.big}>{signed(item.ac_bonus)}</span>
                      <span className={styles.statNote}>to the wearer&rsquo;s armour class</span>
                    </Stat>
                  )}
                  {item.category && <Stat label="Bulk">{titleFromId(item.category)} armour</Stat>}
                </>
              )}
              {item.item_type === 'gear' && (
                <>
                  {isNumber(item.capacity_coins) && (
                    <Stat label="Capacity">{formatWeight(item.capacity_coins)}</Stat>
                  )}
                  {item.combat && (
                    <>
                      <Stat label="Damage in combat">
                        <span className={styles.big}>{formatDice(item.combat.damage)}</span>
                      </Stat>
                      <Stat label="Qualities" span="full">
                        <Qualities qualities={item.combat.qualities} />
                      </Stat>
                      {item.combat.missile_ranges && (
                        <Stat label="Range" span="full">
                          <Ranges ranges={item.combat.missile_ranges} />
                        </Stat>
                      )}
                    </>
                  )}
                  {paramRows(item.params).map(([label, value]) => (
                    <Stat key={label} label={label}>
                      {value}
                    </Stat>
                  ))}
                </>
              )}
            </dl>
          </section>
        </EntryPage>
      )}
    </EntryFrame>
  );
}
