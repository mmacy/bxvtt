import { Fragment } from 'react';

import { formatDice, itemTypeLabel } from '@bxvtt/shared/text';
import { IconButton, Popover, Skeleton } from '@/ui';
import type { InventoryEntry } from './model';
import styles from './sheet.module.css';
import { useMagicItemDetail } from './catalogs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const QUALITY_LABELS: Record<string, string> = {
  melee: 'Melee',
  missile: 'Missile',
  blunt: 'Blunt',
  two_handed: 'Two-handed',
  splash: 'Splash',
  slow: 'Slow',
  charge: 'Charge',
  brace: 'Brace',
  reload: 'Reload',
};

/** The facts a mundane item's template lists, as label and value pairs. */
export function templateFacts(entry: InventoryEntry): Array<[string, string]> {
  const t = entry.template;
  if (!t) return [];
  const facts: Array<[string, string]> = [];
  if (typeof t.item_type === 'string') facts.push(['Type', itemTypeLabel(t.item_type)]);
  const combat = isRecord(t.combat) ? t.combat : t;
  if (typeof combat.damage === 'string') facts.push(['Damage', formatDice(combat.damage)]);
  if (entry.qualities.length > 0) {
    facts.push([
      'Qualities',
      entry.qualities.map((q) => QUALITY_LABELS[q] ?? q.replaceAll('_', ' ')).join(', '),
    ]);
  }
  const ranges = isRecord(combat.missile_ranges) ? combat.missile_ranges : null;
  if (ranges) {
    const parts = ['short', 'medium', 'long'].flatMap((band) => {
      const r = ranges[band];
      return isRecord(r) && typeof r.max_feet === 'number' ? [`${band} ${r.max_feet}′`] : [];
    });
    if (parts.length > 0) facts.push(['Range', parts.join(', ')]);
  }
  if (typeof t.ac === 'number')
    facts.push(['Armour class', `${t.ac} (ascending ${String(t.ac_ascending ?? '')})`]);
  if (typeof t.ac_bonus === 'number') facts.push(['Armour class bonus', `${t.ac_bonus}`]);
  const params = isRecord(t.params) ? t.params : {};
  if (typeof params.light_radius_feet === 'number')
    facts.push(['Light', `${params.light_radius_feet}′ radius`]);
  if (typeof params.burn_turns === 'number') facts.push(['Burns for', `${params.burn_turns} turns`]);
  if (typeof params.burn_turns_per_flask === 'number')
    facts.push(['Burns for', `${params.burn_turns_per_flask} turns a flask`]);
  if (typeof t.lot_size === 'number' && t.lot_size > 1) facts.push(['Sold in lots of', String(t.lot_size)]);
  if (typeof t.weight_coins === 'number') facts.push(['Weight', `${t.weight_coins} coins`]);
  if (typeof t.cost_gp === 'number') facts.push(['Cost', `${t.cost_gp} gp`]);
  return facts;
}

function MagicDetail({ catalogId }: { catalogId: string }) {
  const entry = useMagicItemDetail(catalogId);
  if (entry.loading) return <Skeleton lines={3} />;
  if (!entry.data) return <p className={styles.detailProse}>The rules reference doesn't have this item.</p>;
  const manual = entry.data.manual;
  const lines = Array.isArray(manual)
    ? manual.filter((line): line is string => typeof line === 'string')
    : [];
  return (
    <>
      <dl className={styles.detailFacts}>
        <dt>Kind</dt>
        <dd>{itemTypeLabel(entry.data.category)}</dd>
      </dl>
      {lines.length > 0 && <p className={styles.detailProse}>{lines.join('\n')}</p>}
    </>
  );
}

/** What an inventory entry is, from the view's template or the rules catalog. */
export function ItemDetailBody({ entry }: { entry: InventoryEntry }) {
  if (entry.kind === 'valuable') {
    return (
      <div className={styles.detail}>
        <dl className={styles.detailFacts}>
          <dt>Kind</dt>
          <dd>{itemTypeLabel(entry.itemType ?? 'valuable')}</dd>
          {entry.valueGp !== null && (
            <>
              <dt>Worth</dt>
              <dd>{entry.valueGp.toLocaleString('en-US')} gp</dd>
            </>
          )}
        </dl>
      </div>
    );
  }
  if (entry.kind === 'magic') {
    return (
      <div className={styles.detail}>
        {entry.identified && entry.catalogId ? (
          <MagicDetail catalogId={entry.catalogId} />
        ) : (
          <p className={styles.detailProse}>
            Nobody knows what this is yet. Using it, or a spell or sage that identifies items, reveals it.
          </p>
        )}
        {entry.cursed && (
          <p className={styles.detailProse}>
            It is cursed, and it stays with its bearer until a remove curse lifts it.
          </p>
        )}
      </div>
    );
  }
  const facts = templateFacts(entry);
  return (
    <div className={styles.detail}>
      {facts.length === 0 ? (
        <p className={styles.detailProse}>No more is known about this item.</p>
      ) : (
        <dl className={styles.detailFacts}>
          {facts.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

/** An info button that opens what an entry is. */
export function ItemDetailButton({ entry }: { entry: InventoryEntry }) {
  return (
    <Popover
      title={entry.name}
      width="300px"
      trigger={<IconButton icon="info" label={`About ${entry.name}`} variant="ghost" size="sm" />}
    >
      <ItemDetailBody entry={entry} />
    </Popover>
  );
}
