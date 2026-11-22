import type { LevelRef } from '@bxvtt/shared/protocol';
import { directionLabel } from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canSendCommand,
  useAdventureDocument,
  useGameMode,
  useIsReferee,
  useMapBus,
  useMembers,
  usePermissionContext,
  usePings,
  usePlayerView,
  usePreferences,
  useReduceMotion,
  useRefereeLens,
  useRefereeState,
  useScene,
  useSendPing,
  useSendRefereeCommand,
  useShortcut,
  useTableUser,
  type FocusRequest,
  type GameCommand,
} from '@/app';
import {
  DungeonMap,
  levelKey,
  measure,
  measurementLabel,
  resolveTheme,
  type Direction,
  type DungeonMapHandle,
  type MapPing,
  type MapTarget,
  type MapTool,
  type Point,
} from '@/map';
import { Button, DropdownMenu, Icon, cx, type MenuEntry } from '@/ui';
import { lightEntries } from './actions';
import { mapMenuEntries } from './contextMenu';
import { messageDuration, useMapFeedback } from './feedback';
import { levelLabel, useActionContext, useDungeonNames, useLoreTracker, useSessionLore } from './hooks';
import {
  areaCenterCell,
  buildPlayerLevel,
  buildRefereeLevel,
  levelOptions,
  refereeSource,
  sceneLevel,
  type LevelOption,
} from './levels';
import { CameraControls, LayerBadge, LevelSwitcher, MinimapCard, ThemeSwitcher } from './MapChrome';
import { lightTimeLeft, partyLight } from './party';
import { NewPinDialog, PinDetailDialog } from './PinDialogs';
import { PointMenu } from './PointMenu';
import { Projected } from './Projected';
import { STROKE_WIDTH, useMapAnnotations } from './useMapAnnotations';
import { useExploreSend } from './useExploreSend';
import styles from './explore.module.css';

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'north',
  ArrowDown: 'south',
  ArrowLeft: 'west',
  ArrowRight: 'east',
  KeyW: 'north',
  KeyS: 'south',
  KeyA: 'west',
  KeyD: 'east',
};

/** The shortest time between two pings from this browser. The server allows 5 pings in 2 seconds. */
const PING_INTERVAL_MS = 450;

const FALLBACK_COLOR = '#e69f00';

/** The map's container fills the stage. `DungeonMap` sets its own position, so this overrides it. */
const MAP_STYLE = { position: 'absolute', inset: 0 } as const;

/** The direction an arrow key or W, A, S, or D names, or `null`. */
export function keyDirection(event: Pick<KeyboardEvent, 'key' | 'code'>): Direction | null {
  return KEY_DIRECTIONS[event.key] ?? KEY_DIRECTIONS[event.code] ?? null;
}

/**
 * The dungeon map with its tools. The shell renders it as the stage whenever the party is in a dungeon, in every
 * mode, and draws the encounter and battle overlays above it.
 *
 * - The map shows the viewed level: the party's, or another one the switcher picks. A player sees the party's
 *   map with the scene's stairs, caches, and names. A referee with the lens on sees the whole keyed level.
 * - The arrow keys or W, A, S, and D move the party while the map has focus, and Alt with them turns it. A click
 *   on a neighbouring square steps there. A click or right-click on a door, the party, or a square offers what
 *   bxapi allows there.
 * - The tool rail's tool, the pick requests of other features, and focus requests come over the map bus.
 */
export function MapStage() {
  const view = usePlayerView();
  const scene = useScene();
  const mode = useGameMode();
  const lens = useRefereeLens();
  const isReferee = useIsReferee();
  const refereeState = useRefereeState();
  const adventure = useAdventureDocument();
  const theme = usePreferences((s) => s.mapTheme);
  const setPreference = usePreferences((s) => s.set);
  const reduceMotion = useReduceMotion();
  const me = useTableUser();
  const members = useMembers();
  const permissions = usePermissionContext();
  const lore = useSessionLore();
  const names = useDungeonNames();
  const actions = useActionContext();
  const { send } = useExploreSend();
  const { send: sendReferee } = useSendRefereeCommand();
  const sendPing = useSendPing();
  const pings = usePings();
  useLoreTracker();

  const busTool = useMapBus((s) => s.tool);
  const setBusTool = useMapBus((s) => s.setTool);
  const pick = useMapBus((s) => s.pick);
  const fulfilPick = useMapBus((s) => s.fulfilPick);
  const clearFocus = useMapBus((s) => s.clearFocus);
  const viewedLevel = useMapBus((s) => s.viewedLevel);
  const setViewedLevel = useMapBus((s) => s.setViewedLevel);

  const mapRef = useRef<DungeonMapHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [menu, setMenu] = useState<{ at: Point; items: MenuEntry[] } | null>(null);
  const [newPin, setNewPin] = useState<Point | null>(null);
  const [pinShown, setPinShown] = useState<string | null>(null);
  const [measureFrom, setMeasureFrom] = useState<{ x: number; y: number } | null>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const lastPing = useRef(0);
  const pendingFocus = useRef<Point | 'party' | null>(null);

  // Levels and the map of the viewed one.
  const source = useMemo(
    () => (lens ? refereeSource(refereeState, adventure.data) : null),
    [lens, refereeState, adventure.data],
  );
  const levels = useMemo(() => (view ? levelOptions(view, source) : []), [view, source]);
  const partyLevel = levels.find((level) => level.partyHere) ?? null;
  const requestedKey = viewedLevel ? levelKey(viewedLevel.dungeon_id, viewedLevel.level_number) : null;
  const viewedKey =
    (requestedKey !== null && levels.some((level) => level.key === requestedKey) ? requestedKey : null) ??
    partyLevel?.key ??
    levels[0]?.key ??
    null;
  const map = useMemo(() => {
    if (view === null || viewedKey === null) return null;
    return source
      ? buildRefereeLevel(source, viewedKey)
      : buildPlayerLevel(view, scene, viewedKey, lore.doors);
  }, [view, scene, source, viewedKey, lore.doors]);
  const mapDungeon = map?.dungeonId ?? null;
  const mapLevel = map?.levelNumber ?? null;
  const levelRef = useMemo<LevelRef | null>(
    () =>
      mapDungeon !== null && mapLevel !== null ? { dungeon_id: mapDungeon, level_number: mapLevel } : null,
    [mapDungeon, mapLevel],
  );
  const partyShown = map?.party != null;
  const offLevel = partyLevel !== null && viewedKey !== null && viewedKey !== partyLevel.key;
  const annotations = useMapAnnotations(levelRef);

  const can = useCallback(
    (commandType: string, memberId?: string) => canSendCommand(permissions, commandType, memberId).allowed,
    [permissions],
  );
  const exploring = mode === 'exploring';
  const canMove = exploring && can('move_party');
  const canTurn = exploring && can('turn_party');
  const combat = mode === 'encounter' || mode === 'battle';

  // Movement.
  const move = useCallback(
    (direction: Direction) => {
      if (offLevel) setViewedLevel(null);
      void send({ command_type: 'move_party', direction }, { feedback: 'map' });
    },
    [send, offLevel, setViewedLevel],
  );
  const turn = useCallback(
    (facing: Direction) => {
      if (offLevel) setViewedLevel(null);
      void send({ command_type: 'turn_party', facing }, { feedback: 'map' });
    },
    [send, offLevel, setViewedLevel],
  );

  // The tool: a pick from another feature wins over the rail.
  const tool: MapTool = pick ? (pick.kind === 'cell' ? 'pick-cell' : 'pick-edge') : busTool;

  // Pings.
  const colorOf = useMemo(() => {
    const byId = new Map(members.map((member) => [member.user_id, member]));
    return (userId: string) => byId.get(userId);
  }, [members]);
  const mapPings = useMemo<MapPing[]>(
    () =>
      map === null
        ? []
        : pings
            .filter((ping) => ping.dungeon_id === map.dungeonId && ping.level_number === map.levelNumber)
            .map((ping) => {
              const member = colorOf(ping.user_id);
              return {
                id: ping.id,
                x: ping.x,
                y: ping.y,
                color: member?.color ?? FALLBACK_COLOR,
                label: member?.name,
              };
            }),
    [pings, map, colorOf],
  );
  const say = useMapFeedback((s) => s.say);
  const ping = useCallback(
    (point: Point) => {
      if (map === null) return;
      const now = Date.now();
      if (now - lastPing.current < PING_INTERVAL_MS) {
        say('Ping a little less often, so everyone can follow.', 'info');
        return;
      }
      lastPing.current = now;
      sendPing({
        dungeon_id: map.dungeonId,
        level_number: map.levelNumber,
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100,
      });
    },
    [map, sendPing, say],
  );

  // The context menu.
  const refereeMenu = useMemo(
    () => ({
      enabled: lens && map?.layer === 'referee',
      can: (commandType: string) => can(commandType),
      send: (command: GameCommand) => void sendReferee(command),
    }),
    [lens, map?.layer, can, sendReferee],
  );
  const openMenu = useCallback(
    (target: MapTarget | null, at: Point, world: Point) => {
      if (map === null || actions === null) return;
      const items = mapMenuEntries({
        target,
        world,
        map,
        actions,
        doors: lore.doors,
        referee: refereeMenu,
        tools: {
          ping,
          pin: (point) => setNewPin(point),
          measureFrom: (cell) => {
            setMeasureFrom(cell);
            setHoverCell(cell);
          },
          move,
        },
      });
      setMenu({ at, items });
    },
    [map, actions, lore.doors, refereeMenu, ping, move],
  );
  // Keys on the focused map: move, turn, and the context menu. They run before the map's own pan keys.
  const openPartyMenu = useCallback(() => {
    const handle = mapRef.current;
    const party = map?.party;
    const root = rootRef.current;
    if (!handle || !party || !root) return;
    const camera = handle.getCamera();
    const rect = root.getBoundingClientRect();
    const world = { x: party.x + 0.5, y: party.y + 0.5 };
    const at = {
      x: (world.x - camera.x) * camera.zoom + rect.width / 2,
      y: (world.y - camera.y) * camera.zoom + rect.height / 2,
    };
    openMenu({ kind: 'party', party }, at, world);
  }, [map?.party, openMenu]);
  const keyState = useRef({ canMove, canTurn, move, turn, openPartyMenu });
  useEffect(() => {
    keyState.current = { canMove, canTurn, move, turn, openPartyMenu };
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (event: KeyboardEvent) => {
      // Only the main map's canvas: the minimap has its own arrow keys.
      const target = event.target;
      if (!(target instanceof HTMLCanvasElement) || target.getAttribute('aria-roledescription') !== 'map')
        return;
      if (!root.contains(target)) return;
      if (event.metaKey || event.ctrlKey) return;
      const state = keyState.current;
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        event.stopPropagation();
        state.openPartyMenu();
        return;
      }
      const direction = keyDirection(event);
      if (direction === null || event.shiftKey) return;
      if (event.altKey) {
        if (!state.canTurn) return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) state.turn(direction);
        return;
      }
      if (!state.canMove) return;
      event.preventDefault();
      event.stopPropagation();
      state.move(direction);
    };
    root.addEventListener('keydown', onKey, true);
    return () => root.removeEventListener('keydown', onKey, true);
  }, []);

  // Focus requests from other features. A request for another level switches the level first, and the camera
  // moves once its map is in place.
  const handleFocus = useCallback(
    (request: FocusRequest) => {
      const target = request.target;
      if (target.kind === 'party' || target.kind === 'member') {
        if (offLevel) {
          pendingFocus.current = 'party';
          setViewedLevel(null);
        } else {
          mapRef.current?.centerOnParty();
        }
      } else {
        const key = levelKey(target.dungeon_id, target.level_number);
        const point = { x: target.x + 0.5, y: target.y + 0.5 };
        if (key !== viewedKey && levels.some((level) => level.key === key)) {
          pendingFocus.current = point;
          setViewedLevel(
            partyLevel?.key === key
              ? null
              : { dungeon_id: target.dungeon_id, level_number: target.level_number },
          );
        } else {
          setFollow(false);
          mapRef.current?.panTo(point);
        }
      }
      clearFocus(request.id);
    },
    [clearFocus, offLevel, setViewedLevel, viewedKey, levels, partyLevel?.key],
  );
  const focusHandler = useRef(handleFocus);
  useEffect(() => {
    focusHandler.current = handleFocus;
  });
  useEffect(() => {
    const initial = useMapBus.getState().focus;
    if (initial) focusHandler.current(initial);
    return useMapBus.subscribe((state, previous) => {
      if (state.focus !== null && state.focus !== previous.focus) focusHandler.current(state.focus);
    });
  }, []);
  const partyOnMap = map?.party != null;
  const applyPendingFocus = useCallback(() => {
    const pending = pendingFocus.current;
    if (pending === null) {
      // A level without the party opens on the whole of what the viewer knows of it.
      if (!partyOnMap) mapRef.current?.fitToExplored(false);
      return;
    }
    pendingFocus.current = null;
    if (pending === 'party') mapRef.current?.centerOnParty();
    else {
      setFollow(false);
      mapRef.current?.panTo(pending);
    }
  }, [partyOnMap]);
  const mapKey = map?.key ?? null;
  const applyRef = useRef(applyPendingFocus);
  useEffect(() => {
    applyRef.current = applyPendingFocus;
  });
  useEffect(() => {
    if (mapKey !== null) applyRef.current();
  }, [mapKey]);

  const party = map?.party ?? null;
  const directionTo = (x: number, y: number): Direction | null => {
    if (!party) return null;
    if (x === party.x && y === party.y - 1) return 'north';
    if (x === party.x + 1 && y === party.y) return 'east';
    if (x === party.x && y === party.y + 1) return 'south';
    if (x === party.x - 1 && y === party.y) return 'west';
    return null;
  };
  const onParty = (x: number, y: number) => party !== null && x === party.x && y === party.y;

  /** A click on something at a cell: the party's cell opens its actions, a neighbour steps there. */
  const clickAt = (x: number, y: number, target: MapTarget, screen: Point, world: Point) => {
    if (onParty(x, y)) {
      openMenu(target, screen, world);
      return;
    }
    const direction = directionTo(x, y);
    if (direction && canMove) move(direction);
  };
  const endMeasure = () => {
    if (measureFrom === null) return false;
    setMeasureFrom(null);
    return true;
  };
  useShortcut({
    id: 'explore.measure.cancel',
    keys: 'escape',
    label: 'Stop measuring',
    group: 'Map',
    enabled: measureFrom !== null && pick === null,
    run: () => setMeasureFrom(null),
  });

  // Light and darkness on the party's level.
  const light = view ? partyLight(view) : { lights: [], darkness: false };
  const dark = partyShown && map?.layer === 'player' && (light.lights.length === 0 || light.darkness);
  const memberName = (id: string) => view?.party.find((member) => member.id === id)?.name ?? 'Someone';

  // Area names for a player's map. The referee map draws its own keyed labels.
  const areaLabels = useMemo(() => {
    if (map === null || map.layer === 'referee') return [];
    const level = sceneLevel(scene, map.key);
    if (level === null) return [];
    const hereArea = scene?.here?.area?.id ?? null;
    return level.areas.flatMap((area) => {
      if (map.party && area.id === hereArea) return [];
      const cell = areaCenterCell(area);
      if (!cell) return [];
      const occupied =
        map.features.some((f) => f.x === cell[0] && f.y === cell[1]) ||
        map.transitions.some((t) => t.kind !== 'passage' && t.x === cell[0] && t.y === cell[1]);
      const trapped = level.traps.some((trap) => trap.kind === 'room' && trap.area_id === area.id);
      return [
        { id: area.id, name: area.name, x: cell[0] + 0.5, y: cell[1] + (occupied ? 0.12 : 0.5), trapped },
      ];
    });
  }, [map, scene]);

  // Feedback beside the party.
  const message = useMapFeedback((s) => s.message);
  const bump = useMapFeedback((s) => s.bump);
  const clearMessage = useMapFeedback((s) => s.clear);
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => clearMessage(message.id), messageDuration(message.text));
    return () => clearTimeout(timer);
  }, [message, clearMessage]);

  const pinRecord = pinShown ? (annotations.pinRecords.get(pinShown) ?? null) : null;
  const pinLabel = annotations.pins.find((pin) => pin.id === pinShown)?.label ?? '';
  const themeData = resolveTheme(theme);
  const levelName = (option: LevelOption) => levelLabel(option, levels, names);
  const measurement =
    measureFrom && hoverCell
      ? measure(
          { x: measureFrom.x + 0.5, y: measureFrom.y + 0.5 },
          { x: hoverCell.x + 0.5, y: hoverCell.y + 0.5 },
        )
      : null;
  const lightMenu = actions ? lightEntries(actions) : [];

  if (view === null) return null;

  const ariaLabel = canMove
    ? 'Dungeon map. Arrow keys or W, A, S, and D move the party. Alt and an arrow key turns it. Shift and an arrow key pans. Shift and F10 opens the actions where the party stands.'
    : 'Dungeon map';

  return (
    <div
      ref={rootRef}
      className={cx(styles.stage, combat && styles.stageCombat)}
      data-theme-map={theme}
      style={{ background: themeData.rock.color }}
    >
      <DungeonMap
        ref={mapRef}
        map={map}
        theme={theme}
        tool={tool}
        pings={mapPings}
        strokes={annotations.strokes}
        pins={annotations.pins}
        strokeColor={me?.color ?? FALLBACK_COLOR}
        strokeWidth={STROKE_WIDTH}
        followParty={follow && partyShown}
        onFollowPartyChange={setFollow}
        reducedMotion={reduceMotion}
        initialView="party"
        ariaLabel={ariaLabel}
        className={styles.map}
        style={MAP_STYLE}
        onCellClick={(target, info) => {
          if (endMeasure()) return;
          if (onParty(target.x, target.y)) {
            openMenu(target, info.screen, info.world);
            return;
          }
          if (target.direction && canMove) move(target.direction);
          else if (target.floor && canMove && partyShown)
            say('Step one square at a time. Click a square beside the party.', 'info');
        }}
        onEdgeClick={(target, info) => {
          if (endMeasure()) return;
          if (target.edge.kind === 'passage' && target.direction && canMove) {
            move(target.direction);
            return;
          }
          if (target.edge.kind === 'door') {
            if (target.direction) openMenu(target, info.screen, info.world);
            else say('Walk up to the door to use it.', 'info');
          }
        }}
        onFeatureClick={(target, info) => {
          if (endMeasure()) return;
          clickAt(target.feature.x, target.feature.y, target, info.screen, info.world);
        }}
        onTransitionClick={(target, info) => {
          if (endMeasure()) return;
          clickAt(target.transition.x, target.transition.y, target, info.screen, info.world);
        }}
        onPartyClick={(target, info) => {
          if (endMeasure()) return;
          openMenu(target, info.screen, info.world);
        }}
        onPinClick={(target) => setPinShown(target.pin.id)}
        onContextMenu={(target, screen, info) => {
          setMeasureFrom(null);
          openMenu(target, screen, info.world);
        }}
        onHover={(target) => {
          if (measureFrom === null) return;
          if (target?.kind === 'cell') setHoverCell({ x: target.x, y: target.y });
        }}
        onPing={ping}
        onStrokeComplete={(stroke) =>
          annotations.addStroke(stroke.points, me?.color ?? FALLBACK_COLOR, stroke.width)
        }
        onStrokeErase={annotations.erase}
        onPinCreate={(point) => setNewPin(point)}
        onPickCell={(target) => {
          if (map)
            fulfilPick({
              kind: 'cell',
              dungeon_id: map.dungeonId,
              level_number: map.levelNumber,
              x: target.x,
              y: target.y,
            });
        }}
        onPickEdge={(target) => {
          if (map)
            fulfilPick({
              kind: 'edge',
              dungeon_id: map.dungeonId,
              level_number: map.levelNumber,
              x: target.cell.x,
              y: target.cell.y,
              direction: target.side,
            });
        }}
      />

      <Projected map={mapRef}>
        {dark && party && <div className={styles.darkness} data-wx={party.x + 0.5} data-wy={party.y + 0.5} />}
        {areaLabels.map((area) => (
          <div
            key={area.id}
            className={styles.areaLabel}
            data-wx={area.x}
            data-wy={area.y}
            data-minzoom={16}
            style={{ color: themeData.label.color, ['--halo' as string]: themeData.label.halo }}
          >
            <span>{area.name}</span>
            {area.trapped && <Icon name="trap" size={12} />}
          </div>
        ))}
        {party && bump && (
          <div key={bump.id} className={styles.bumpAnchor} data-wx={party.x + 0.5} data-wy={party.y + 0.5}>
            <span className={cx(styles.bumpRing, styles[`bumpRing-${bump.direction}`])} />
            <span className={cx(styles.bump, styles[`bump-${bump.direction}`])} />
          </div>
        )}
        {party && message && (
          <div
            key={message.id}
            className={styles.messageAnchor}
            data-wx={party.x + 0.5}
            data-wy={party.y + 0.5}
          >
            <span className={cx(styles.message, message.tone === 'refused' && styles.messageRefused)}>
              {message.text}
            </span>
          </div>
        )}
        {measureFrom && measurement && (
          <>
            <svg className={styles.measureSvg}>
              <line
                className={styles.measureLine}
                data-wx1={measureFrom.x + 0.5}
                data-wy1={measureFrom.y + 0.5}
                data-wx2={(hoverCell?.x ?? measureFrom.x) + 0.5}
                data-wy2={(hoverCell?.y ?? measureFrom.y) + 0.5}
              />
            </svg>
            <div
              className={styles.measureAnchor}
              data-wx={(hoverCell?.x ?? measureFrom.x) + 0.5}
              data-wy={(hoverCell?.y ?? measureFrom.y) + 0.5}
            >
              <span className={styles.measureLabel}>{measurementLabel(measurement)}</span>
            </div>
          </>
        )}
      </Projected>

      {/* Screen readers hear the same lines the map shows beside the party. */}
      <div className={styles.srOnly} aria-live="polite">
        {message?.text ?? ''}
      </div>

      <div className={styles.chromeTop}>
        <div className={styles.chromeRow}>
          {isReferee && map && <LayerBadge layer={map.layer} />}
          <ThemeSwitcher theme={theme} onChange={(next) => setPreference('mapTheme', next)} />
          {levels.length > 1 && (
            <LevelSwitcher
              levels={levels}
              viewedKey={viewedKey}
              levelName={levelName}
              onSelect={(option) =>
                setViewedLevel(
                  option.partyHere
                    ? null
                    : { dungeon_id: option.dungeonId, level_number: option.levelNumber },
                )
              }
            />
          )}
          {levels.length === 1 && levels[0] && (
            <span className={styles.levelName}>{levelName(levels[0])}</span>
          )}
        </div>
        {offLevel && partyLevel && (
          <div className={styles.offLevel} role="status">
            <Icon name="eye" size={14} />
            <span>The party is on {levelName(partyLevel).toLowerCase()}.</span>
            <Button size="sm" variant="ghost" onClick={() => setViewedLevel(null)}>
              Show the party
            </Button>
          </div>
        )}
        {measureFrom && (
          <div className={styles.offLevel} role="status">
            <Icon name="ruler" size={14} />
            <span>Point at a square to measure. Click or press Escape to stop.</span>
          </div>
        )}
      </div>

      <div className={styles.chromeSide}>
        <CameraControls map={mapRef} follow={follow} onFollowChange={setFollow} partyShown={partyShown} />
      </div>

      {!combat && (
        <div className={styles.chromeBottomRight}>
          <MinimapCard map={map} target={mapRef} theme={theme} facing={party?.facing ?? null} />
        </div>
      )}

      {!combat && partyShown && (
        <div
          className={cx(styles.chromeBottomLeft, map?.layer === 'referee' && styles.chromeBottomLeftRaised)}
        >
          <LightStatus
            lights={light.lights.map((entry) => ({
              name: memberName(entry.memberId),
              left: lightTimeLeft(entry.remainingRounds),
            }))}
            darkness={light.darkness}
            menu={lightMenu}
          />
        </div>
      )}

      <MoveShortcuts canMove={canMove} canTurn={canTurn} move={move} turn={turn} />

      <PointMenu
        at={menu?.at ?? null}
        items={menu?.items ?? []}
        label="Map actions"
        onClose={() => setMenu(null)}
        onAnchorFocus={() => mapRef.current?.focus()}
      />

      <NewPinDialog
        open={newPin !== null}
        referee={lens}
        onCancel={() => setNewPin(null)}
        onSave={async (text, refereesOnly) => {
          if (newPin === null) return false;
          const ok = await annotations.addPin(newPin.x, newPin.y, text, refereesOnly);
          if (ok) {
            setNewPin(null);
            if (busTool === 'pin') setBusTool('select');
          }
          return ok;
        }}
      />
      <PinDetailDialog
        pin={pinRecord}
        label={pinLabel}
        mayRemove={pinRecord !== null && annotations.mayErase(pinRecord.author_id)}
        onClose={() => setPinShown(null)}
        onRemove={annotations.removePin}
      />
    </div>
  );
}

interface LightStatusProps {
  lights: Array<{ name: string; left: string | null }>;
  darkness: boolean;
  menu: MenuEntry[];
}

/** The party's light: who carries one and how long it has left, or a clear warning in the dark. */
function LightStatus({ lights, darkness, menu }: LightStatusProps) {
  const lit = lights.length > 0 && !darkness;
  const text = darkness
    ? 'Magical darkness covers the party.'
    : lit
      ? lights
          .map((light) =>
            light.left ? `${light.name}'s light, ${light.left} left` : `${light.name}'s light`,
          )
          .join(' · ')
      : 'No light. The party is in the dark.';
  return (
    <div className={cx(styles.lightStatus, !lit && styles.lightDark)} role="status">
      <Icon name={lit ? 'torch' : 'moon'} size={16} />
      <span>{text}</span>
      {!lit && menu.length > 0 && <LightMenuButton menu={menu} />}
    </div>
  );
}

function LightMenuButton({ menu }: { menu: MenuEntry[] }) {
  return (
    <DropdownMenu
      side="top"
      items={menu}
      trigger={
        <Button size="sm" variant="secondary" icon="torch" className={styles.lightAction}>
          Light
        </Button>
      }
    />
  );
}

const SHORTCUT_KEYS: ReadonlyArray<readonly [string, Direction]> = [
  ['arrowup', 'north'],
  ['arrowright', 'east'],
  ['arrowdown', 'south'],
  ['arrowleft', 'west'],
];

interface MoveShortcutsProps {
  canMove: boolean;
  canTurn: boolean;
  move: (direction: Direction) => void;
  turn: (direction: Direction) => void;
}

/** The arrow keys move the party from anywhere outside a text field, and Alt with them turns it. */
function MoveShortcuts(props: MoveShortcutsProps) {
  return (
    <>
      {SHORTCUT_KEYS.map(([key, direction]) => (
        <DirectionShortcut key={direction} keyName={key} direction={direction} {...props} />
      ))}
    </>
  );
}

function DirectionShortcut({
  keyName,
  direction,
  canMove,
  canTurn,
  move,
  turn,
}: MoveShortcutsProps & { keyName: string; direction: Direction }) {
  const name = directionLabel(direction).toLowerCase();
  useShortcut({
    id: `explore.move.${direction}`,
    keys: keyName,
    label: `Move the party ${name}`,
    group: 'Party',
    enabled: canMove,
    run: () => move(direction),
  });
  useShortcut({
    id: `explore.turn.${direction}`,
    keys: `alt+${keyName}`,
    label: `Turn the party to face ${name}`,
    group: 'Party',
    enabled: canTurn,
    run: () => turn(direction),
  });
  return null;
}
