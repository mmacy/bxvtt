/**
 * The whole adventure key: every area on every level, searchable, each with its full key, a button that
 * centers the map on it, and a button that places the party there.
 */
import { useDeferredValue, useMemo, useState } from 'react';
import { Accordion, Badge, Button, EmptyState, SearchInput, SectionLabel, Skeleton } from '@/ui';
import {
  allLevels,
  areaCenter,
  areaRef,
  areaVisited,
  type AreaSpec,
  type LevelSpec,
} from '../model/adventure';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import type { RefereeData } from '../useReferee';
import { AreaDetails, ShowOnMapButton } from './AreaDetails';
import { ArrivalFollowUps } from './FollowUps';
import { WanderingBlock } from './HereNow';
import styles from './sections.module.css';

function matches(area: AreaSpec, query: string): boolean {
  if (query === '') return true;
  const haystack = [
    area.name,
    area.id,
    area.description,
    ...area.features.map((f) => f.description),
    ...(area.encounter?.monsters.map((m) => m.template_id) ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function PlaceHereButton({
  dungeonId,
  level,
  area,
  data,
}: {
  dungeonId: string;
  level: LevelSpec;
  area: AreaSpec;
  data: RefereeData;
}) {
  const { run, busy, outcome, clear } = useRefereeCommand();
  const [placed, setPlaced] = useState(false);
  const [x, y] = areaCenter(area);
  return (
    <div className={styles.keyActions}>
      <div className={styles.rowActions}>
        <ShowOnMapButton dungeonId={dungeonId} levelNumber={level.number} area={area} />
        <Button
          size="sm"
          variant="ghost"
          icon="footprints"
          disabled={busy}
          onClick={async () => {
            setPlaced(false);
            const ok = await run({
              command_type: 'place_party',
              location: {
                kind: 'dungeon',
                dungeon_id: dungeonId,
                level_number: level.number,
                position: [x, y],
                facing: 'north',
              },
            });
            setPlaced(ok);
          }}
        >
          Place party here
        </Button>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
      {placed && (
        <ArrivalFollowUps data={data} dungeonId={dungeonId} levelNumber={level.number} area={area} />
      )}
    </div>
  );
}

/** Every area of every level. */
export function AreaKey({ data }: { data: RefereeData }) {
  const { adventure, record, ctx, here } = data;
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [open, setOpen] = useState<string[]>([]);
  const levels = useMemo(() => (adventure ? allLevels(adventure) : []), [adventure]);
  if (!adventure || !record) {
    return data.adventureError ? (
      <EmptyState
        icon="warning"
        size="compact"
        title="Couldn't load adventure"
        description={data.adventureError.detail}
      />
    ) : (
      <Skeleton lines={8} />
    );
  }
  const total = levels.reduce(
    (sum, { level }) => sum + level.areas.filter((a) => matches(a, deferred)).length,
    0,
  );
  return (
    <div className={styles.section}>
      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search names, descriptions, and monsters"
        aria-label="Search adventure key"
      />
      {total === 0 && <p className={styles.secondaryLine}>No matching areas.</p>}
      {levels.map(({ dungeon, level }) => {
        const areas = level.areas.filter((a) => matches(a, deferred));
        if (areas.length === 0) return null;
        const partyHere = here?.dungeon.id === dungeon.id && here.level.number === level.number;
        return (
          <section
            key={`${dungeon.id}:${level.number}`}
            aria-label={`${dungeon.name}, level ${level.number}`}
          >
            <SectionLabel level={3}>
              {dungeon.name}, level {level.number}
              {partyHere ? ' · the party is here' : ''}
            </SectionLabel>
            {deferred === '' && level.guidance && (
              <details className={styles.details}>
                <summary>Level guidance and wandering monsters</summary>
                <p className={styles.guidance}>{level.guidance}</p>
                <WanderingBlock level={level} data={data} showCounter={false} />
              </details>
            )}
            <Accordion
              type="multiple"
              value={open}
              onValueChange={setOpen}
              items={areas.map((area) => {
                const value = `${dungeon.id}:${level.number}:${area.id}`;
                const ref = areaRef(dungeon.id, level.number, area.id);
                const isHere = partyHere && here.area?.id === area.id;
                const visited = areaVisited(record, dungeon.id, level.number, area);
                const hasMonsters = area.encounter !== null && area.encounter !== undefined;
                const resolved = record.resolvedEncounters.has(ref);
                const hasTreasure =
                  area.features.some((f) => f.kind === 'treasure_cache') || Boolean(area.treasure);
                const hasTrap = Boolean(area.trap) || area.features.some((f) => f.trap);
                return {
                  value,
                  title: area.name,
                  meta: (
                    <span className={styles.metaRow}>
                      {isHere && <Badge tone="info">Party</Badge>}
                      {hasMonsters && (
                        <Badge tone={resolved ? 'neutral' : 'danger'}>
                          {resolved ? 'Cleared' : 'Monsters'}
                        </Badge>
                      )}
                      {hasTreasure && <Badge tone="gold">Treasure</Badge>}
                      {hasTrap && <Badge tone="warning">Trap</Badge>}
                      {!visited && !isHere && <span className={styles.secondary}>Unvisited</span>}
                    </span>
                  ),
                  content: open.includes(value) ? (
                    <div className={styles.areaKeyBody}>
                      <PlaceHereButton dungeonId={dungeon.id} level={level} area={area} data={data} />
                      <AreaDetails
                        adventure={adventure}
                        dungeonId={dungeon.id}
                        level={level}
                        area={area}
                        record={record}
                        ctx={ctx}
                        data={data}
                      />
                    </div>
                  ) : null,
                };
              })}
            />
          </section>
        );
      })}
    </div>
  );
}
