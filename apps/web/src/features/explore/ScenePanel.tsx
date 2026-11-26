import type { GameEvent } from '@bxvtt/shared/protocol';
import { describeEvent, directionLabel, type TextContext } from '@bxvtt/shared/text';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  UNKEYED_PLACE_TITLE,
  cachesToTake,
  scopedStorage,
  useHere,
  usePlayerView,
  useTextContext,
  type Here,
} from '@/app';
import { Button, DropdownMenu, Icon, IconButton, Parchment, cx, type IconName, type MenuEntry } from '@/ui';
import {
  cacheEntries,
  cacheLabel,
  doorEntries,
  doorsHere,
  joinGroups,
  pileEntries,
  stairsHere,
  transitionAction,
  transitionDescription,
  treasureEntries,
} from './actions';
import { useActionContext, useSessionDoors } from './hooks';
import { doorLoreKey } from './levels';
import { levelKey } from '@/map';
import styles from './explore.module.css';

/**
 * The sentence the feed uses for entering an area, such as "The party enters the kitchen.", from the text layer.
 */
export function enteredText(
  areaId: string,
  here: Pick<Here, 'dungeonId' | 'levelNumber'>,
  ctx: TextContext,
): string {
  const event = {
    event_type: 'location_entered',
    code: 'exploration.location.entered',
    visibility: 'player',
    location_kind: 'area',
    location_id: areaId,
    level_number: here.levelNumber,
    dungeon_id: here.dungeonId,
    narrative: null,
    via: null,
    transition_ref: null,
  } as unknown as GameEvent;
  return describeEvent(event, ctx)?.text ?? 'The party enters a new area.';
}

/** The title where the adventure keys no area: a corridor, a bridge deck, or open ground. */
export const UNNAMED_PLACE = UNKEYED_PLACE_TITLE;

/** How long the full card stays after the party enters an area, in milliseconds. */
export const RECEDE_MS = 10_000;

/** The browser's choice to keep the scene card open, which the user makes by opening it by hand. */
const prefs = scopedStorage('explore');
const PINNED_KEY = 'scene.pinned';

/** The count on the folded bar: "1 feature here", "3 features here". */
export function thingsHere(count: number): string {
  return count === 1 ? '1 feature here' : `${count} features here`;
}

/** What a known trap means to the party, in one sentence. */
export function trapSentence(trap: {
  kind: 'room' | 'treasure';
  state: 'found' | 'sprung' | 'removed';
}): string {
  const prep = trap.kind === 'treasure' ? 'on the treasure' : 'in this room';
  switch (trap.state) {
    case 'found':
      return `You found a trap ${prep}.`;
    case 'sprung':
      return `A trap ${prep} has already sprung.`;
    case 'removed':
      return `A trap ${prep} has been disarmed.`;
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

const MENU_HELP = {
  Treasure: 'Choose what to do with the treasure',
  'Dropped goods': 'Choose what to do with the dropped goods',
  Door: 'Choose what to do with this door',
} as const;

/** One action as a button, or several as a menu. */
function Actions({ entries, label }: { entries: MenuEntry[]; label: keyof typeof MENU_HELP }) {
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
        <Button size="sm" variant="secondary" iconEnd="chevron-down" tooltip={MENU_HELP[label]}>
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
  const here = useHere();
  const view = usePlayerView();
  const ctx = useActionContext();
  const ctxText = useTextContext();
  const doorLore = useSessionDoors();
  const [pinned, setPinned] = useState(() => prefs.read(PINNED_KEY) === true);
  const [open, setOpen] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const bodyId = useId();
  const area = here?.area ?? null;
  const areaId = area?.id ?? null;
  const cell = here ? here.position.join(',') : null;
  // A new area speaks once and shows its card; a step within the same area folds the card away. The checks run
  // during render, as React recommends for state that follows a prop.
  const [last, setLast] = useState<{ area: string | null; cell: string | null } | undefined>(undefined);
  if (last === undefined || last.area !== areaId || last.cell !== cell) {
    if (last !== undefined && last.area !== areaId && area !== null && here !== null) {
      setAnnouncement(enteredText(area.id, here, ctxText));
      setFresh(true);
      setOpen(true);
    } else if (last !== undefined && last.cell !== cell && !pinned) {
      setOpen(false);
    }
    setLast({ area: areaId, cell });
  }
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(false), 1600);
    return () => clearTimeout(timer);
  }, [fresh]);
  // After the first read, the card folds to its title bar, unless the user opened it by hand.
  useEffect(() => {
    if (!open || pinned) return;
    const timer = setTimeout(() => setOpen(false), RECEDE_MS);
    return () => clearTimeout(timer);
  }, [open, pinned, areaId]);
  // A press on the map folds it too: the user has turned to the map.
  useEffect(() => {
    if (pinned) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof HTMLCanvasElement && target.getAttribute('aria-roledescription') === 'map')
        setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [pinned]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    setPinned(next);
    prefs.write(PINNED_KEY, next);
  };

  if (here === null || view === null || ctx === null) return null;
  const facing = view.location.kind === 'dungeon' ? view.location.facing : null;
  const key = levelKey(here.dungeonId, here.levelNumber);
  const [x, y] = here.position;
  const stairs = stairsHere(here);
  const caches = cachesToTake(here);
  const passages = here.transitions.filter(
    (transition): transition is typeof transition & { side: 'north' | 'east' | 'south' | 'west' } =>
      transition.kind === 'passage' &&
      (transition.side === 'north' ||
        transition.side === 'east' ||
        transition.side === 'south' ||
        transition.side === 'west'),
  );
  const doors = doorsHere(view);
  const traps = here.roomTrap ? [here.roomTrap] : [];
  const title = area?.name ?? UNNAMED_PLACE;
  const count =
    stairs.length +
    passages.length +
    caches.length +
    (here.pile ? 1 : 0) +
    doors.length +
    here.features.length +
    traps.length;
  const quick = joinGroups(
    stairs.length > 0 && ctx.can('use_stairs')
      ? [
          {
            label: transitionAction(stairs[0] ?? { kind: 'stairs_down' }),
            icon: 'stairs' as const,
            onSelect: () => ctx.run({ command_type: 'use_stairs' }),
          },
        ]
      : [],
    ctx.can('move_party')
      ? passages.map((passage) => ({
          label: `Go through the ${directionLabel(passage.side).toLowerCase()} passage`,
          icon: 'arrow-right' as const,
          onSelect: () =>
            ctx.run({ command_type: 'move_party', direction: passage.side }, { feedback: 'map' }),
        }))
      : [],
    treasureEntries(ctx),
    doors.flatMap((door) => {
      const entries = doorEntries(
        ctx,
        door.direction,
        door,
        doorLore[doorLoreKey(key, x, y, door.direction)],
      );
      const items = entries.slice(1);
      return items.some((entry) => entry.type !== 'label')
        ? [
            {
              type: 'submenu' as const,
              label: `Door to the ${directionLabel(door.direction).toLowerCase()}`,
              icon: door.open ? ('door-open' as const) : ('door' as const),
              items,
            },
          ]
        : [];
    }),
  );

  return (
    <section className={cx(styles.scene, fresh && styles.sceneFresh)} aria-label="Current location">
      <header className={styles.sceneHeader}>
        <Icon name={area ? 'map' : 'footprints'} size={16} className={styles.sceneHeaderIcon} />
        <h2 className={styles.sceneTitle}>{title}</h2>
        {open && facing && (
          <span className={styles.sceneMeta}>Facing {directionLabel(facing).toLowerCase()}</span>
        )}
        {!open && quick.length > 0 && (
          <DropdownMenu
            align="end"
            items={quick}
            trigger={
              <Button size="sm" variant="secondary" icon="more" tooltip="Choose an action for something here">
                {thingsHere(count)}
              </Button>
            }
          />
        )}
        {!open && quick.length === 0 && count > 0 && (
          <span className={styles.sceneMeta}>{thingsHere(count)}</span>
        )}
        <IconButton
          icon={open ? 'minimize' : 'maximize'}
          label={open ? 'Hide description' : 'Show description'}
          size="sm"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
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
            <p className={styles.sceneCorridor}>You are in an unnamed passage between rooms.</p>
          )}
          <ul className={styles.sceneList} aria-label="Features here">
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
            {caches.map((cache) => {
              const label = cacheLabel(cache, caches);
              return (
                <Row
                  key={cache.id}
                  icon="chest"
                  action={<Actions entries={cacheEntries(ctx, cache, label)} label="Treasure" />}
                >
                  <span>
                    {cache.reachable
                      ? caches.length > 1
                        ? `${label} is within reach.`
                        : 'Treasure is within reach.'
                      : `${label} lies elsewhere in this room.`}
                  </span>
                  {cache.description && <span className={styles.sceneSub}>{cache.description}</span>}
                  {cache.trapState && (
                    <span className={styles.sceneSub}>
                      {trapSentence({ kind: 'treasure', state: cache.trapState })}
                    </span>
                  )}
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
                    A door to the {name} is{' '}
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
            {traps.map((trap) => (
              <Row
                key={`trap-${trap.area_id}`}
                icon="trap"
                tone={trap.state === 'found' ? 'warning' : undefined}
              >
                {trapSentence({ kind: 'room', state: trap.state })}
              </Row>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
