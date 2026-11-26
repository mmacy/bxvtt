/**
 * The dungeon map: a canvas renderer and React components for bxapi levels.
 *
 * Build a `LevelMap` with `fromPlayerView` or `fromReferee`, then render `<DungeonMap map={...} />`.
 * See `README.md` in this directory for the props, the callbacks, and an integration example.
 */
export { DungeonMap, type DungeonMapHandle, type DungeonMapProps } from './DungeonMap';
export { Minimap, type MinimapProps } from './Minimap';
export {
  DARKNESS_EFFECT_KINDS,
  DEFAULT_LIGHT_RADIUS_FEET,
  LIGHT_EFFECT_KINDS,
  currentLevelKey,
  describeTrap,
  fromPlayerView,
  fromReferee,
  fromRefereeView,
  playerLevelKeys,
  refereeLevelKeys,
  refereeLight,
  type Bounds,
  type EdgeKind,
  type FeatureKind,
  type ItemPhrase,
  type LevelMap,
  type MapArea,
  type MapCell,
  type MapDoor,
  type MapEdge,
  type MapEncounter,
  type MapFeature,
  type MapLayer,
  type MapParty,
  type MapTransition,
  type MapTrap,
  type MapWandering,
  type PlayerMapExtras,
  type PlayerMapOptions,
  type RefereeMapOptions,
  type RefereeMapSource,
  type TransitionKind,
  type TrapState,
} from './model';
export {
  CELL_FEET,
  cellOfRef,
  edgeCells,
  edgeKey,
  idOfRef,
  levelKey,
  parseEdgeKey,
  parseLevelKey,
  type Direction,
  type EdgeSide,
  type ParsedEdgeKey,
  type Point,
} from './geometry';
export type { Camera, Viewport, ZoomLimits } from './camera';
export type {
  CellTarget,
  EdgeTarget,
  FeatureTarget,
  MapTarget,
  PartyTarget,
  PinTarget,
  TransitionTarget,
} from './hit';
export {
  measure,
  measurementLabel,
  type MapPin,
  type MapPing,
  type MapPointer,
  type MapStroke,
  type MapTool,
  type Measurement,
  type RulerMetric,
} from './overlays';
export { describeTarget, type TargetDescription } from './describe';
export { isCursorTool, measurementText, type CursorTool } from './cursor';
export {
  THEMES,
  blueprint,
  parchment,
  resolveTheme,
  torchlit,
  type MapTheme,
  type ThemeName,
} from './themes';
export type { MapPointerInfo, RendererStats } from './render/renderer';
