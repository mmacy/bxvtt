import type { GameEvent, SceneHere, SceneTrap } from '@bxvtt/shared/protocol';
import { describeEvent, directionLabel, type TextContext } from '@bxvtt/shared/text';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { usePlayerView, useScene, useTextContext } from '@/app';
import { Button, DropdownMenu, Icon, IconButton, Parchment, cx, type IconName, type MenuEntry } from '@/ui';
import {
  cacheEntries,
  cacheLabel,
  doorEntries,
  doorsHere,
  pileEntries,
  stairsHere,
  transitionAction,
  transitionDescription,
} from './actions';
import { useActionContext, useSessionDoors } from './hooks';
import { doorLoreKey } from './levels';
import { levelKey } from '@/map';
import styles from './explore.module.css';

/**
 * The sentence the feed uses for entering an area, such as "The party enters the kitchen.", from the text layer.
 */
export function enteredText(areaId: string, here: SceneHere, ctx: TextContext): string {
  const event = {
    event_type: 'location_entered',
    code: 'exploration.location.entered',
    visibility: 'player',
    location_kind: 'area',
    location_id: areaId,
    level_number: here.level_number,
    dungeon_id: here.dungeon_id,
    narrative: null,
    via: null,
    transition_ref: null,
  } as unknown as GameEvent;
  return describeEvent(event, ctx)?.text ?? 'The party enters a new area.';
}

/** What a known trap means to the party, in one sentence. */
export function trapSentence(trap: Pick<SceneTrap, 'kind' | 'trigger' | 'state'>): string {
  const what = trap.kind === 'treasure' ? 'the treasure' : 'this room';
  switch (trap.state) {
    case 'found':
      return trap.trigger === 'enter'
        ? `The party found a trap in ${what}. It springs on whoever walks in.`
        : `The party found a trap on ${what}. It springs when it's opened.`;
    case 'sprung':
      return `A trap in ${what} has already sprung.`;
    case 'removed':
      return `A trap on ${what} has been disarmed.`;
  }
}

interface RowProps {
  icon: IconName;
  children: ReactNode;
  action?: ReactNode;
  tone?: 'warning';
}

function Row({ icon, children, action, tone }: RowProps) {
  return (
    <li className={cx(styles.sceneRow, tone === 'warning' && styles.sceneRowWarning)}>
      <Icon name={icon} size={16} className={styles.sceneRowIcon} />
      <div className={styles.sceneRowText}>{children}</div>
      {action && <div className={styles.sceneRowAction}>{action}</div>}
    </li>
  );
}

/** One action as a button, or several as a menu. */
function Actions({ entries, label }: { entries: MenuEntry[]; label: string }) {
  const actionable = entries.filter((entry) => entry.type !== 'label' && entry.type !== 'separator');
  if (actionable.length === 0) return null;
  const [only] = actionable;
  if (actionable.length === 1 && only && (only.type === undefined || only.type === 'item')) {
    return (
      <Button size="sm" variant="secondary" onClick={() => only.onSelect?.()}>
        {only.label}
      </Button>
    );
  }
  return (
    <DropdownMenu
      align="end"
      items={entries}
      trigger={
        <Button size="sm" variant="secondary" iconEnd="chevron-down">
          {label}
        </Button>
      }
    />
  );
}

/**
 * What the party perceives where it stands, as a referee would read it aloud: the area's name and description,
 * then what's here (stairs, treasure, dropped goods, doors, features, and known traps), each with its action.
 * In a corridor it says so. It announces a new area to screen readers without moving focus.
 */
export function ScenePanel() {
  const scene = useScene();
  const view = usePlayerView();
  const ctx = useActionContext();
  const ctxText = useTextContext();
  const doorLore = useSessionDoors();
  const [open, setOpen] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const bodyId = useId();
  const here = scene?.here ?? null;
  const area = here?.area ?? null;
  const areaId = area?.id ?? null;
  // A new area speaks once. The check runs during render, as React recommends for state that follows a prop.
  const [lastArea, setLastArea] = useState<string | null | undefined>(undefined);
  if (lastArea !== areaId) {
    if (lastArea !== undefined && area !== null && here !== null) {
      setAnnouncement(enteredText(area.id, here, ctxText));
      setFresh(true);
    }
    setLastArea(areaId);
  }
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(false), 1600);
    return () => clearTimeout(timer);
  }, [fresh]);

  if (here === null || view === null || ctx === null) return null;
  const facing = view.location.kind === 'dungeon' ? view.location.facing : null;
  const key = levelKey(here.dungeon_id, here.level_number);
  const [x, y] = here.position;
  const stairs = stairsHere(scene);
  const passages = here.transitions.filter(
    (transition): transition is typeof transition & { side: 'north' | 'east' | 'south' | 'west' } =>
      transition.kind === 'passage' &&
      (transition.side === 'north' ||
        transition.side === 'east' ||
        transition.side === 'south' ||
        transition.side === 'west'),
  );
  const doors = doorsHere(view);
  const traps = here.traps.filter((trap) => trap.kind === 'room');
  const title = area?.name ?? 'A corridor';

  return (
    <section className={cx(styles.scene, fresh && styles.sceneFresh)} aria-label="Where the party stands">
      <header className={styles.sceneHeader}>
        <Icon name={area ? 'map' : 'footprints'} size={16} className={styles.sceneHeaderIcon} />
        <h2 className={styles.sceneTitle}>{title}</h2>
        {facing && <span className={styles.sceneMeta}>Facing {directionLabel(facing).toLowerCase()}</span>}
        <IconButton
          icon={open ? 'chevron-up' : 'chevron-down'}
          label={open ? 'Hide the description' : 'Show the description'}
          size="sm"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
        />
      </header>
      <div className={styles.srOnly} aria-live="polite">
        {announcement}
      </div>
      {open && (
        <div id={bodyId} className={styles.sceneBody}>
          {area ? (
            <Parchment variant="note" className={styles.sceneParchment}>
              <p className={styles.sceneDescription}>{area.description}</p>
            </Parchment>
          ) : (
            <p className={styles.sceneCorridor}>You are in a corridor. Nothing here has a name.</p>
          )}
          <ul className={styles.sceneList} aria-label="What is here">
            {stairs.map((transition) => (
              <Row
                key={`${transition.kind}-${transition.position.join(',')}`}
                icon={transition.kind === 'stairs_up' ? 'arrow-up' : 'stairs'}
                action={
                  ctx.can('use_stairs') ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => ctx.run({ command_type: 'use_stairs' })}
                    >
                      {transitionAction(transition)}
                    </Button>
                  ) : undefined
                }
              >
                {transitionDescription(transition)}
              </Row>
            ))}
            {passages.map((passage) => (
              <Row
                key={`passage-${passage.side}`}
                icon="arrow-right"
                action={
                  ctx.can('move_party') ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        ctx.run({ command_type: 'move_party', direction: passage.side }, { feedback: 'map' })
                      }
                    >
                      Go through
                    </Button>
                  ) : undefined
                }
              >
                {`A passage leads through the ${directionLabel(passage.side).toLowerCase()} wall.`}
              </Row>
            ))}
            {here.caches.map((cache) => {
              const label = cacheLabel(cache, here.caches);
              return (
                <Row
                  key={cache.id}
                  icon="chest"
                  action={<Actions entries={cacheEntries(ctx, cache, label)} label="Treasure" />}
                >
                  <span>
                    {cache.reachable
                      ? here.caches.length > 1
                        ? `${label} is within reach.`
                        : 'Treasure is within reach.'
                      : `${label} lies elsewhere in this room.`}
                  </span>
                  {cache.trap && <span className={styles.sceneSub}>{trapSentence(cache.trap)}</span>}
                </Row>
              );
            })}
            {here.pile && (
              <Row icon="coins" action={<Actions entries={pileEntries(ctx)} label="Dropped goods" />}>
                Dropped goods lie here.
              </Row>
            )}
            {doors.map((door) => {
              const name = directionLabel(door.direction).toLowerCase();
              const entries = doorEntries(
                ctx,
                door.direction,
                door,
                doorLore[doorLoreKey(key, x, y, door.direction)],
              );
              const known = entries.length > 1 && entries[1]?.type === 'label' ? entries[1].label : null;
              return (
                <Row
                  key={door.direction}
                  icon={door.open ? 'door-open' : 'door'}
                  action={
                    <Actions entries={entries.filter((entry) => entry.type !== 'label')} label="Door" />
                  }
                >
                  <span>
                    A door to the {name},{' '}
                    {door.open
                      ? door.wedged
                        ? 'wedged open'
                        : 'open'
                      : door.wedged
                        ? 'wedged shut'
                        : 'closed'}
                    .
                  </span>
                  {known && <span className={styles.sceneSub}>{known}</span>}
                </Row>
              );
            })}
            {here.features.map((feature) => (
              <Row key={feature.id} icon={feature.kind === 'construction_trick' ? 'search' : 'eye'}>
                {feature.description}
              </Row>
            ))}
            {traps.map((trap, index) => (
              <Row key={`trap-${index}`} icon="trap" tone={trap.state === 'found' ? 'warning' : undefined}>
                {trapSentence(trap)}
              </Row>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
