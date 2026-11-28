import type { GameEvent } from '@bxvtt/shared/protocol';
import { describeEvent, directionLabel, type TextContext } from '@bxvtt/shared/text';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  UNKEYED_PLACE_TITLE,
  cachesNotEmptied,
  pileContentsSentence,
  rolledTreasureNumbers,
  scopedStorage,
  treasureRowText,
  useCanSend,
  useHere,
  useLegalCommand,
  usePlayerTextContext,
  usePlayerView,
  useTextContext,
  type Here,
  type HereFeature,
  type Permission,
} from '@/app';
import {
  Badge,
  Button,
  DropdownMenu,
  Icon,
  IconButton,
  Parchment,
  cx,
  type BadgeTone,
  type IconName,
  type MenuEntry,
} from '@/ui';
import {
  cacheMoreEntries,
  cacheSnippet,
  doorEntries,
  doorsHere,
  joinGroups,
  stairsHere,
  takeLabel,
  transitionAction,
  transitionDescription,
  treasureEntries,
  type ActionContext,
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

/** The count on the folded bar: "1 thing here", "3 things here". */
export function thingsHere(count: number): string {
  return count === 1 ? '1 thing here' : `${count} things here`;
}

type KnownTrapState = 'found' | 'sprung' | 'removed';

/**
 * The badge for a trap the party knows about: beside a treasure, or beside the room's name in the header for a
 * room trap, which is only ever found or sprung.
 */
export function treasureTrapBadge(state: KnownTrapState): {
  label: string;
  tone: BadgeTone;
  icon?: IconName;
} {
  switch (state) {
    case 'found':
      return { label: 'Trapped', tone: 'warning', icon: 'trap' };
    case 'sprung':
      return { label: 'Trap sprung', tone: 'neutral' };
    case 'removed':
      return { label: 'Trap disarmed', tone: 'neutral' };
  }
}

/**
 * The accessible name of a treasure's More menu, which differs for each treasure when several lie here.
 *
 * @param cache - The treasure.
 * @param count - How many treasures here have a More menu.
 * @param numbers - The rolled treasures' numbers, from `rolledTreasureNumbers`.
 */
export function treasureMoreLabel(
  cache: Pick<HereFeature, 'id' | 'description'>,
  count: number,
  numbers: ReadonlyMap<string, number> = new Map(),
): string {
  if (count <= 1) return 'More for this treasure';
  const snippet = cacheSnippet(cache);
  return snippet === null ? `More for treasure ${numbers.get(cache.id) ?? 1}` : `More for ${snippet}`;
}

interface RowProps {
  icon: IconName;
  children: ReactNode;
  action?: ReactNode;
}

function Row({ icon, children, action }: RowProps) {
  return (
    <li className={styles.sceneRow}>
      <Icon name={icon} size={16} className={styles.sceneRowIcon} />
      <div className={styles.sceneRowText}>{children}</div>
      {action && <div className={styles.sceneRowAction}>{action}</div>}
    </li>
  );
}

const MENU_HELP = {
  Door: 'Choose what to do with this door',
} as const;

/** One action as a button, or several as a menu. */
function Actions({ entries, label }: { entries: MenuEntry[]; label: keyof typeof MENU_HELP }) {
  const actionable = entries.filter((entry) => entry.type !== 'label' && entry.type !== 'separator');
  if (actionable.length === 0) return null;
  const [only] = actionable;
  if (actionable.length === 1 && only && (only.type === undefined || only.type === 'item')) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={only.disabled}
        disabledReason={only.disabledReason}
        onClick={() => only.onSelect?.()}
      >
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

/** Whether `take_treasure` is legal now, and whether the viewer may send it. */
interface TakeState {
  legal: boolean;
  permission: Permission;
}

/**
 * The dropped goods on the party's cell: what lies there, from the pile's coins and contents, and the Pick up
 * button. Its visible label is short, and its accessible name says what it picks up.
 */
function PileRow({ here, take, ctx }: { here: Here; take: TakeState; ctx: ActionContext }) {
  const contentsId = useId();
  const text = usePlayerTextContext();
  const contents = here.pile === null ? '' : pileContentsSentence(here.pile, text);
  const action = take.legal ? (
    <Button
      size="sm"
      variant="secondary"
      aria-label="Pick up dropped goods"
      aria-describedby={contents === '' ? undefined : contentsId}
      disabled={!take.permission.allowed}
      disabledReason={take.permission.reason}
      onClick={() => ctx.run({ command_type: 'take_treasure', feature_id: 'pile' })}
    >
      Pick up
    </Button>
  ) : undefined;
  return (
    <Row icon="coins" action={action}>
      <span>Dropped goods lie here.</span>
      {contents !== '' && (
        <span id={contentsId} className={styles.sceneSub}>
          {contents}
        </span>
      )}
    </Row>
  );
}

/**
 * One treasure where the party stands: its description, the trap the party knows about, and its actions. Take
 * is a button of its own, and the rest of the actions sit in the More menu. An emptied treasure stays on the list
 * with an "Emptied" badge and no actions. A treasure out of reach says to step closer while the party explores.
 */
function TreasureRow({
  cache,
  list,
  menus,
  here,
  take,
  ctx,
}: {
  cache: HereFeature;
  /** Every treasure on the list, for the rolled treasures' numbers. */
  list: readonly HereFeature[];
  /** How many treasures on the list have a More menu. */
  menus: number;
  here: Here;
  take: TakeState;
  ctx: ActionContext;
}) {
  const descriptionId = useId();
  const text = treasureRowText(cache, list);
  if (cache.emptied) {
    return (
      <Row icon="chest">
        <span className={styles.sceneLine}>
          <span className={styles.sceneMuted}>{text}</span>
          <Badge tone="neutral">Emptied</Badge>
        </span>
      </Row>
    );
  }
  const badge = cache.trapState ? treasureTrapBadge(cache.trapState) : null;
  const more = cache.inReach ? cacheMoreEntries(ctx, cache) : [];
  const showTake = cache.inReach && take.legal;
  const action =
    showTake || more.length > 0 ? (
      <div className={styles.sceneRowButtons}>
        {showTake && (
          <Button
            size="sm"
            variant="secondary"
            aria-describedby={descriptionId}
            disabled={!take.permission.allowed}
            disabledReason={take.permission.reason}
            onClick={() => ctx.run({ command_type: 'take_treasure', feature_id: cache.id })}
          >
            {takeLabel(cache)}
          </Button>
        )}
        {more.length > 0 && (
          <DropdownMenu
            align="end"
            items={more}
            trigger={
              <IconButton
                icon="more"
                size="sm"
                variant="ghost"
                label={treasureMoreLabel(cache, menus, rolledTreasureNumbers(list))}
              />
            }
          />
        )}
      </div>
    ) : undefined;
  return (
    <Row icon="chest" action={action}>
      <span className={styles.sceneLine}>
        <span id={descriptionId}>{text}</span>
        {badge && (
          <Badge tone={badge.tone} icon={badge.icon}>
            {badge.label}
          </Badge>
        )}
      </span>
      {here.exploring && !cache.inReach && <span className={styles.sceneSub}>Step closer to reach it.</span>}
    </Row>
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
  const takeLegal = useLegalCommand('take_treasure') !== null;
  const takePermission = useCanSend('take_treasure');
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
  const caches = here.caches;
  const openCaches = cachesNotEmptied(here);
  const take: TakeState = { legal: takeLegal, permission: takePermission };
  // The More menu offers something only for a treasure in reach.
  const menus = openCaches.filter((cache) => cache.inReach && cacheMoreEntries(ctx, cache).length > 0).length;
  const passages = here.transitions.filter(
    (transition): transition is typeof transition & { side: 'north' | 'east' | 'south' | 'west' } =>
      transition.kind === 'passage' &&
      (transition.side === 'north' ||
        transition.side === 'east' ||
        transition.side === 'south' ||
        transition.side === 'west'),
  );
  const doors = doorsHere(view);
  const roomTrap = here.roomTrap ? treasureTrapBadge(here.roomTrap) : null;
  const title = area?.name ?? UNNAMED_PLACE;
  // An emptied treasure and the room's trap don't count: the count is the cue that something here wants attention.
  const count =
    stairs.length +
    passages.length +
    openCaches.length +
    (here.pile ? 1 : 0) +
    doors.length +
    here.features.length;
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
        <div className={styles.sceneTitleGroup}>
          <h2 className={styles.sceneTitle}>{title}</h2>
          {roomTrap && (
            <Badge tone={roomTrap.tone} icon={roomTrap.icon} className={styles.sceneTitleBadge}>
              {roomTrap.label}
            </Badge>
          )}
        </div>
        {open && facing && (
          <span className={styles.sceneMeta}>Facing {directionLabel(facing).toLowerCase()}</span>
        )}
        {!open && quick.length > 0 && (
          <DropdownMenu
            align="end"
            items={quick}
            trigger={
              <Button
                size="sm"
                variant="secondary"
                icon="more"
                tooltip="Choose an action for something here"
                aria-label={thingsHere(count)}
              >
                {/* On a phone the button shows the number alone, so the room's name keeps the space. */}
                <span aria-hidden="true">
                  {count}
                  <span className={styles.sceneCountWords}>
                    {count === 1 ? ' thing here' : ' things here'}
                  </span>
                </span>
              </Button>
            }
          />
        )}
        {!open && quick.length === 0 && count > 0 && (
          <span className={styles.sceneMeta}>{thingsHere(count)}</span>
        )}
        <IconButton
          icon={open ? 'minimize' : 'maximize'}
          label={open ? 'Collapse description' : 'Show description'}
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
          <ul className={styles.sceneList} aria-label="Things here">
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
            {caches.map((cache) => (
              <TreasureRow
                key={cache.id}
                cache={cache}
                list={caches}
                menus={menus}
                here={here}
                take={take}
                ctx={ctx}
              />
            ))}
            {here.pile && <PileRow here={here} take={take} ctx={ctx} />}
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
          </ul>
        </div>
      )}
    </section>
  );
}
