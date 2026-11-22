/**
 * Here and now: the key for where the party stands. The encounter under way comes first, then the area's
 * description and key, the doors on its walls, and the level's guidance and wandering monster table.
 */
import { formatDice, timeUnitNoun } from '@bxvtt/shared/text';
import { Badge, Banner, EmptyState, Icon, SectionLabel, Skeleton } from '@/ui';
import { doorsAround, type LevelSpec } from '../model/adventure';
import { templateLabel } from '../model/describe';
import type { RefereeData } from '../useReferee';
import { AreaDetails, DoorRow } from './AreaDetails';
import { EncounterNow } from './EncounterNow';
import styles from './sections.module.css';

type TableRow = NonNullable<LevelSpec['wandering']['table']>['rows'][number];

/**
 * The table's rows with neighbouring die faces that hold the same entry joined into one range, as the
 * adventure writes the table: `1 to 6, Bandits on their rounds, 1d4`.
 */
export function groupRows(rows: readonly TableRow[]): Array<{ row: TableRow; from: number; to: number }> {
  const same = (a: TableRow, b: TableRow) =>
    a.name === b.name &&
    a.count_dice === b.count_dice &&
    a.count_fixed === b.count_fixed &&
    JSON.stringify(a.entry) === JSON.stringify(b.entry);
  const out: Array<{ row: TableRow; from: number; to: number }> = [];
  for (const row of [...rows].sort((a, b) => a.roll - b.roll)) {
    const last = out[out.length - 1];
    if (last && last.to === row.roll - 1 && same(last.row, row)) last.to = row.roll;
    else out.push({ row, from: row.roll, to: row.roll });
  }
  return out;
}

/** The level's wandering monster check and table. */
export function WanderingBlock({
  level,
  data,
  showCounter,
}: {
  level: LevelSpec;
  data: RefereeData;
  showCounter: boolean;
}) {
  const wandering = level.wandering;
  const state = data.state;
  const counter = state?.exploration.wandering_counter ?? 0;
  const rows = wandering.table?.rows ?? [];
  if (wandering.chance_in_six === 0 && rows.length === 0) {
    return <p className={styles.secondaryLine}>No wandering monsters on this level.</p>;
  }
  return (
    <div className={styles.block}>
      <div className={styles.rowHead}>
        <Icon name="footprints" size={16} className={styles.rowIcon} />
        <span className={styles.rowTitle}>
          {wandering.chance_in_six} in 6, checked every {wandering.interval_turns}{' '}
          {timeUnitNoun('turn', wandering.interval_turns)}
        </span>
      </div>
      {showCounter && (
        <div className={styles.meter}>
          <span className={styles.secondary}>
            {counter} of {wandering.interval_turns} {timeUnitNoun('turn', wandering.interval_turns)} since the
            last check.
          </span>
          {state?.exploration.noise_since_check && <Badge tone="warning">The party made noise</Badge>}
        </div>
      )}
      {rows.length > 0 && (
        <table className={styles.table}>
          <caption className="visually-hidden">{wandering.table?.label ?? 'Wandering monsters'}</caption>
          <thead>
            <tr>
              <th scope="col">Roll</th>
              <th scope="col">Encounter</th>
              <th scope="col">Number</th>
            </tr>
          </thead>
          <tbody>
            {groupRows(rows).map(({ row, from, to }) => (
              <tr key={from}>
                <td className={styles.num}>{from === to ? from : `${from} to ${to}`}</td>
                <td>
                  {row.name ??
                    (row.entry.kind === 'monster'
                      ? row.entry.monster_ids.map((id) => templateLabel(id, data.adventure, 2)).join(' or ')
                      : 'NPC party')}
                </td>
                <td className={styles.num}>
                  {row.count_fixed ?? (row.count_dice ? formatDice(row.count_dice) : '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The referee's view of where the party is now. */
export function HereNow({ data }: { data: RefereeData }) {
  const { state, adventure, record, place, here, ctx } = data;
  if (!state || !record || !place) return null;
  if (data.adventureError) {
    return (
      <Banner tone="danger" title="The adventure's key didn't load">
        {data.adventureError.detail}
      </Banner>
    );
  }
  if (!adventure) return <Skeleton lines={6} />;

  const encounter = state.encounter;

  if (place.kind === 'town') {
    const town = adventure.town;
    return (
      <div className={styles.section}>
        {encounter && <EncounterNow encounter={encounter} state={state} adventure={adventure} />}
        <header className={styles.placeHead}>
          <Icon name="town" size={20} className={styles.placeIcon} />
          <div>
            <h3 className={styles.placeName}>{town.name}</h3>
            <p className={styles.secondary}>The party is in town.</p>
          </div>
        </header>
        <p className={styles.description}>{town.description}</p>
        {town.services.length > 0 && (
          <section aria-label="Services">
            <SectionLabel level={4}>Services</SectionLabel>
            <ul className={styles.bullets}>
              {town.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          </section>
        )}
        {adventure.hooks.length > 0 && (
          <section aria-label="Hooks">
            <SectionLabel level={4}>Rumours and hooks</SectionLabel>
            <ul className={styles.bullets}>
              {adventure.hooks.map((hook) => (
                <li key={hook}>{hook}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  if (!here) {
    return <EmptyState icon="map" size="compact" title="This level isn't in the adventure's key" />;
  }
  const { dungeon, level, area } = here;
  const cornerDoors = area ? [] : doorsAround(level, [[here.x, here.y]], record.doors, dungeon.id);

  return (
    <div className={styles.section}>
      {encounter && (
        <section className={styles.urgent} aria-label="Encounter">
          <h3 className={styles.sectionTitle}>
            <Icon name="battle" size={16} /> {state.battle ? 'Battle' : 'Encounter'}
          </h3>
          <EncounterNow encounter={encounter} state={state} adventure={adventure} />
        </section>
      )}

      {!area && (
        <p className={styles.secondaryLine}>The party stands in a corridor, outside any keyed area.</p>
      )}

      {area ? (
        <AreaDetails
          adventure={adventure}
          dungeonId={dungeon.id}
          level={level}
          area={area}
          record={record}
          ctx={ctx}
          data={data}
        />
      ) : (
        cornerDoors.length > 0 && (
          <section aria-label="Doors">
            <SectionLabel level={4}>Doors by the party</SectionLabel>
            <ul className={styles.doorList}>
              {cornerDoors.map((door) => (
                <DoorRow
                  key={door.key}
                  door={door}
                  dungeonId={dungeon.id}
                  levelNumber={level.number}
                  ctx={ctx}
                />
              ))}
            </ul>
          </section>
        )
      )}

      <section aria-label="This level" className={styles.levelBlock}>
        <SectionLabel level={4}>Level {level.number}</SectionLabel>
        {level.guidance && <p className={styles.guidance}>{level.guidance}</p>}
        <WanderingBlock level={level} data={data} showCounter />
      </section>
    </div>
  );
}
