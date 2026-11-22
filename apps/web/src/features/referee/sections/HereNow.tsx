/**
 * Here and now: the key for where the party stands. The encounter under way comes first, then the area's
 * description and key, the doors on its walls, and the level's guidance and wandering monster table.
 */
import { count, formatDice } from '@bxvtt/shared/text';
import { Badge, Banner, EmptyState, Icon, Skeleton } from '@/ui';
import { doorsAround, type LevelSpec } from '../model/adventure';
import { templateLabel } from '../model/describe';
import type { RefereeData } from '../useReferee';
import { AreaDetails, DoorRow } from './AreaDetails';
import { EncounterNow } from './EncounterNow';
import styles from './sections.module.css';

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
          {wandering.chance_in_six} in 6, checked every {count(wandering.interval_turns, 'turn')}
        </span>
      </div>
      {showCounter && (
        <div className={styles.meter}>
          <span className={styles.secondary}>
            {counter} of {count(wandering.interval_turns, 'turn')} since the last check.
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
            {rows.map((row) => (
              <tr key={row.roll}>
                <td className={styles.num}>{row.roll}</td>
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
            <h4 className={styles.subhead}>Services</h4>
            <ul className={styles.bullets}>
              {town.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          </section>
        )}
        {adventure.hooks.length > 0 && (
          <section aria-label="Hooks">
            <h4 className={styles.subhead}>Rumours and hooks</h4>
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
        />
      ) : (
        cornerDoors.length > 0 && (
          <section aria-label="Doors">
            <h4 className={styles.subhead}>Doors by the party</h4>
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
        <h4 className={styles.subhead}>Level {level.number}</h4>
        {level.guidance && <p className={styles.guidance}>{level.guidance}</p>}
        <WanderingBlock level={level} data={data} showCounter />
      </section>
    </div>
  );
}
