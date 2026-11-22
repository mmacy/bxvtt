/**
 * The referee's key for one area: what the adventure wrote (description, monsters, treasure, traps, features,
 * doors, and ways out) beside what play has recorded (encounter resolved, trap found or sprung, cache emptied,
 * door opened).
 */
import { directionLabel, formatCoins, itemList, type TextContext } from '@bxvtt/shared/text';
import { useMapBus } from '@/app';
import { Badge, Button, Icon, type BadgeTone } from '@/ui';
import {
  areaCenter,
  areaRef,
  doorNow,
  doorsAround,
  featureRef,
  levelFeaturesOn,
  transitionsOn,
  trapStatus,
  type Adventure,
  type AreaSpec,
  type DoorFacts,
  type FeatureSpec,
  type LevelSpec,
  type PlayRecord,
  type TrapSpec,
  type TrapStatus,
} from '../model/adventure';
import {
  clauseText,
  conditionText,
  encounterTags,
  encounterText,
  trapText,
  trapTriggerText,
} from '../model/describe';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import styles from './sections.module.css';

const TRAP_BADGE: Record<TrapStatus, { label: string; tone: BadgeTone }> = {
  hidden: { label: 'Not found', tone: 'neutral' },
  found: { label: 'Found', tone: 'warning' },
  sprung: { label: 'Sprung', tone: 'danger' },
  removed: { label: 'Removed', tone: 'success' },
};

function TrapBlock({ trap, status, title }: { trap: TrapSpec; status: TrapStatus; title: string }) {
  const badge = TRAP_BADGE[status];
  return (
    <div className={styles.trap}>
      <div className={styles.rowHead}>
        <Icon name="trap" size={16} className={styles.trapIcon} />
        <span className={styles.rowTitle}>{title}</span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className={styles.prose}>{trapTriggerText(trap)}</p>
      <p className={styles.prose}>{trapText(trap)}</p>
    </div>
  );
}

function cacheContents(feature: FeatureSpec, ctx: TextContext): string[] {
  const lines: string[] = [];
  const coins = formatCoins(feature.coins, 'long');
  if (coins !== 'no coins') lines.push(coins);
  const items = itemList([...feature.item_ids, ...feature.magic_item_ids], ctx);
  lines.push(...items);
  for (const valuable of feature.valuables) lines.push(`${valuable.name} (${valuable.value_gp} gp)`);
  return lines;
}

function FeatureBlock({
  feature,
  dungeonId,
  levelNumber,
  record,
  ctx,
}: {
  feature: FeatureSpec;
  dungeonId: string;
  levelNumber: number;
  record: PlayRecord;
  ctx: TextContext;
}) {
  const ref = featureRef(dungeonId, levelNumber, feature.id);
  const isCache = feature.kind === 'treasure_cache';
  const emptied = record.emptiedCaches.has(ref);
  const trick = feature.kind === 'construction_trick';
  const contents = isCache ? cacheContents(feature, ctx) : [];
  return (
    <li className={styles.feature}>
      <div className={styles.rowHead}>
        <Icon name={isCache ? 'chest' : trick ? 'search' : 'info'} size={16} className={styles.rowIcon} />
        <span className={styles.rowTitle}>
          {isCache ? 'Treasure' : trick ? 'Construction trick' : 'Feature'}
        </span>
        <span className={styles.idMark}>{feature.id}</span>
        {isCache && <Badge tone={emptied ? 'neutral' : 'gold'}>{emptied ? 'Taken' : 'Still here'}</Badge>}
        {trick && (
          <Badge tone={record.foundTricks.has(ref) ? 'warning' : 'neutral'}>
            {record.foundTricks.has(ref) ? 'Found' : 'Not found'}
          </Badge>
        )}
        {feature.cell && <span className={styles.secondary}>at {feature.cell.join(', ')}</span>}
      </div>
      <p className={styles.prose}>{feature.description}</p>
      {contents.length > 0 && (
        <ul className={styles.contents} aria-label="Contents">
          {contents.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {feature.trap && <TrapBlock trap={feature.trap} status={trapStatus(record, ref)} title="Trapped" />}
    </li>
  );
}

function doorLabel(door: DoorFacts): string {
  const where = directionLabel(door.direction).toLowerCase();
  const beyond = door.beyond ? `to ${door.beyond.name}` : 'to a corridor';
  return `${capitalize(where)} wall, ${beyond}`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;
}

/** One door with its facts and the changes a referee makes most. */
export function DoorRow({
  door,
  dungeonId,
  levelNumber,
  ctx,
}: {
  door: DoorFacts;
  dungeonId: string;
  levelNumber: number;
  ctx: TextContext;
}) {
  const now = doorNow(door);
  const { run, busy, outcome, clear } = useRefereeCommand();
  const set = (change: Record<string, boolean>) =>
    run({
      command_type: 'set_door_state',
      dungeon_id: dungeonId,
      level_number: levelNumber,
      x: door.x,
      y: door.y,
      direction: door.direction,
      ...change,
    });
  const tags: Array<{ label: string; tone: BadgeTone }> = [];
  tags.push(now.open ? { label: 'Open', tone: 'success' } : { label: 'Closed', tone: 'neutral' });
  if (now.secret)
    tags.push(now.found ? { label: 'Secret, found', tone: 'info' } : { label: 'Secret', tone: 'referee' });
  if (now.locked) tags.push({ label: 'Locked', tone: 'warning' });
  else if (door.spec.locked) tags.push({ label: 'Unlocked', tone: 'neutral' });
  if (now.stuck) tags.push({ label: 'Stuck', tone: 'warning' });
  if (now.wedged) tags.push({ label: 'Wedged', tone: 'warning' });
  if (now.gated) tags.push({ label: 'Gated', tone: 'magic' });
  const gate = door.spec.requires;
  const label = doorLabel(door);
  return (
    <li className={styles.door}>
      <div className={styles.rowHead}>
        <Icon
          name={now.secret ? 'door-secret' : now.locked ? 'door-locked' : now.open ? 'door-open' : 'door'}
          size={16}
          className={styles.rowIcon}
        />
        <span className={styles.rowTitle}>{label}</span>
        <span className={styles.secondary}>
          {door.x}, {door.y}
        </span>
      </div>
      <div className={styles.doorBar}>
        <div className={styles.tags}>
          {tags.map((tag) => (
            <Badge key={tag.label} tone={tag.tone}>
              {tag.label}
            </Badge>
          ))}
        </div>
        <div className={styles.rowActions} role="group" aria-label={`Change the door: ${label}`}>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => set({ open: !now.open })}>
            {now.open ? 'Close' : 'Open'}
          </Button>
          {door.spec.locked && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => set({ unlocked: now.locked })}>
              {now.locked ? 'Unlock' : 'Lock'}
            </Button>
          )}
          {now.secret && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => set({ discovered: !now.found })}>
              {now.found ? 'Hide again' : 'Reveal'}
            </Button>
          )}
          {now.wedged && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => set({ wedged: false })}>
              Free the spike
            </Button>
          )}
        </div>
      </div>
      {gate && (
        <div className={styles.gate}>
          <p className={styles.prose}>
            <strong>Opens when </strong>
            {conditionText(gate.condition, ctx)}.
          </p>
          {gate.narrative?.refusal && <p className={styles.quote}>{gate.narrative.refusal}</p>}
        </div>
      )}
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </li>
  );
}

const TRANSITION_LABEL: Record<string, string> = {
  stairs_up: 'Stairs up',
  stairs_down: 'Stairs down',
  trapdoor: 'Trapdoor',
  chute: 'Chute',
  passage: 'Passage',
};

export interface AreaDetailsProps {
  adventure: Adventure;
  dungeonId: string;
  level: LevelSpec;
  area: AreaSpec;
  record: PlayRecord;
  ctx: TextContext;
  /** Hides the description, when the caller already shows it. */
  hideDescription?: boolean;
  /** Shows the doors with their controls. */
  showDoors?: boolean;
}

/** Everything the adventure keys in one area, with its state in play. */
export function AreaDetails({
  adventure,
  dungeonId,
  level,
  area,
  record,
  ctx,
  hideDescription = false,
  showDoors = true,
}: AreaDetailsProps) {
  const ref = areaRef(dungeonId, level.number, area.id);
  const encounter = area.encounter;
  const resolved = record.resolvedEncounters.has(ref);
  const alerted = record.alertedAreas.has(ref);
  const features = [...area.features, ...levelFeaturesOn(level, area.cells)];
  const doors = showDoors ? doorsAround(level, area.cells, record.doors, dungeonId) : [];
  const transitions = transitionsOn(level, area.cells);
  const triggers = adventure.triggers.filter(
    (t) =>
      t.when.pattern_type === 'area_entered' &&
      t.when.area_id === area.id &&
      t.when.level_number === level.number,
  );
  return (
    <div className={styles.areaDetails}>
      {!hideDescription && <p className={styles.description}>{area.description}</p>}

      {encounter && (
        <section className={styles.block} aria-label="Monsters">
          <div className={styles.rowHead}>
            <Icon name="skull" size={16} className={styles.dangerIcon} />
            <span className={styles.rowTitle}>{encounterText(encounter, adventure)}</span>
            <Badge tone={resolved ? 'success' : 'danger'}>{resolved ? 'Resolved' : 'Unresolved'}</Badge>
            {alerted && !resolved && <Badge tone="warning">Alerted</Badge>}
          </div>
          {encounterTags(encounter).length > 0 && (
            <div className={styles.tags}>
              {encounterTags(encounter).map((tag) => (
                <Badge key={tag} tone="neutral" appearance="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {encounter.hoard && record.generatedLairHoards.has(ref) && (
            <p className={styles.secondaryLine}>The lair hoard has been rolled.</p>
          )}
        </section>
      )}

      {area.treasure && (
        <section className={styles.block} aria-label="Treasure by type">
          <div className={styles.rowHead}>
            <Icon name="coins" size={16} className={styles.goldIcon} />
            <span className={styles.rowTitle}>
              {area.treasure.unguarded
                ? 'Unguarded treasure'
                : `Treasure type ${area.treasure.letters.join(', ')}`}
            </span>
            <Badge tone={record.generatedTreasureAreas.has(ref) ? 'neutral' : 'gold'}>
              {record.generatedTreasureAreas.has(ref) ? 'Rolled' : 'Not rolled yet'}
            </Badge>
          </div>
          <p className={styles.secondaryLine}>The game rolls it when the party first enters.</p>
        </section>
      )}

      {area.trap && <TrapBlock trap={area.trap} status={trapStatus(record, ref)} title="Room trap" />}

      {features.length > 0 && (
        <ul className={styles.featureList} aria-label="Features and treasure">
          {features.map((feature) => (
            <FeatureBlock
              key={feature.id}
              feature={feature}
              dungeonId={dungeonId}
              levelNumber={level.number}
              record={record}
              ctx={ctx}
            />
          ))}
        </ul>
      )}

      {transitions.length > 0 && (
        <ul className={styles.plainList} aria-label="Ways out">
          {transitions.map((t, index) => (
            <li key={index} className={styles.rowHead}>
              <Icon name="stairs" size={16} className={styles.rowIcon} />
              <span className={styles.rowTitle}>{TRANSITION_LABEL[t.kind] ?? 'Way out'}</span>
              <span className={styles.secondary}>
                to level {t.to_level_number}
                {t.to_dungeon_id !== dungeonId
                  ? ` of ${ctx.dungeons[t.to_dungeon_id] ?? 'another dungeon'}`
                  : ''}
                , at {t.position.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {triggers.length > 0 && (
        <ul className={styles.plainList} aria-label="Triggers here">
          {triggers.map((trigger) => (
            <li key={trigger.id} className={styles.triggerNote}>
              <div className={styles.rowHead}>
                <Icon name="flag" size={16} className={styles.rowIcon} />
                <span className={styles.rowTitle}>
                  {clauseText({ pattern: trigger.when, conditions: trigger.conditions }, ctx)}
                </span>
              </div>
              {trigger.narrative?.fired && <p className={styles.prose}>{trigger.narrative.fired}</p>}
            </li>
          ))}
        </ul>
      )}

      {doors.length > 0 && (
        <section aria-label="Doors">
          <h4 className={styles.subhead}>Doors</h4>
          <ul className={styles.doorList}>
            {doors.map((door) => (
              <DoorRow
                key={door.key}
                door={door}
                dungeonId={dungeonId}
                levelNumber={level.number}
                ctx={ctx}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A button that centers the map on an area. */
export function ShowOnMapButton({
  dungeonId,
  levelNumber,
  area,
  label = 'Show on the map',
}: {
  dungeonId: string;
  levelNumber: number;
  area: AreaSpec;
  label?: string;
}) {
  const requestFocus = useMapBus((s) => s.requestFocus);
  const [x, y] = areaCenter(area);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon="target"
      onClick={() => requestFocus({ kind: 'cell', dungeon_id: dungeonId, level_number: levelNumber, x, y })}
    >
      {label}
    </Button>
  );
}
