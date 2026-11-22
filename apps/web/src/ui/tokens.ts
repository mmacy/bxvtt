/**
 * Typed mirror of the token values that JavaScript needs, such as the canvas map renderer,
 * the dice animation, and procedural portraits. CSS remains the source of truth for styling;
 * keep these values in step with `tokens.css`.
 */

export const playerColorIds = [
  'vermilion',
  'saffron',
  'orpiment',
  'weld',
  'malachite',
  'verdigris',
  'cerulean',
  'azurite',
  'ultramarine',
  'tyrian',
  'madder',
  'slate',
] as const;

export type PlayerColorId = (typeof playerColorIds)[number];

export interface PlayerColor {
  id: PlayerColorId;
  /** Display name for pickers, in sentence case. */
  label: string;
  hex: string;
  /** CSS custom property that holds the color. */
  cssVar: `--player-${PlayerColorId}`;
}

const playerHex: Record<PlayerColorId, string> = {
  vermilion: '#e4572e',
  saffron: '#f29e2e',
  orpiment: '#e3c444',
  weld: '#a4c639',
  malachite: '#3fae6a',
  verdigris: '#2bb3a3',
  cerulean: '#3fa7d6',
  azurite: '#4f84e3',
  ultramarine: '#8676f2',
  tyrian: '#b664da',
  madder: '#e0569a',
  slate: '#8d9cab',
};

export const playerColors: readonly PlayerColor[] = playerColorIds.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
  hex: playerHex[id],
  cssVar: `--player-${id}`,
}));

export function isPlayerColorId(value: string): value is PlayerColorId {
  return (playerColorIds as readonly string[]).includes(value);
}

/** Hex value of a player color. */
export function playerColorHex(id: PlayerColorId): string {
  return playerHex[id];
}

/** Hues for game events, as used in the feed, floating numbers, and the map. */
export const eventColors = {
  damage: '#e6644c',
  heal: '#6dbf8c',
  magic: '#b39cf4',
  gold: '#f0c75e',
  referee: '#f08a74',
} as const;

export type EventColor = keyof typeof eventColors;

export const coinColors = {
  pp: '#dfe3e8',
  gp: '#f0c75e',
  ep: '#cfc58a',
  sp: '#b9c0c8',
  cp: '#c47a48',
} as const;

export type CoinKind = keyof typeof coinColors;

/** Chrome colors that a canvas needs to match its surroundings. */
export const chromeColors = {
  bgApp: '#16120f',
  bgStage: '#0f0d0a',
  surface1: '#1c1814',
  surface2: '#231e19',
  border: '#352e27',
  text: '#e7ddcc',
  textMuted: '#c0b3a0',
  accent: '#c8974a',
  focus: '#ffc45e',
  paper: '#eee2c6',
  paperInk: '#2a2017',
} as const;

export const fonts = {
  display: "'Fraunces Variable', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  ui: "'Atkinson Hyperlegible Next Variable', 'Segoe UI', system-ui, sans-serif",
  numeric: "'Rokkitt Variable', Rockwell, 'Roboto Slab', Georgia, serif",
} as const;

/** Durations in milliseconds. */
export const durations = {
  instant: 80,
  fast: 120,
  base: 180,
  slow: 280,
  slower: 420,
  /** Upper bound for a full dice roll animation. */
  diceRoll: 1100,
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  rail: 20,
  dock: 30,
  topbar: 40,
  dropdown: 1000,
  overlay: 1100,
  modal: 1200,
  popover: 1300,
  toast: 1400,
  tooltip: 1500,
} as const;

/** Viewport widths in pixels where layouts change. */
export const breakpoints = {
  /** Below this width the table dock becomes a drawer. */
  tablet: 1100,
  phone: 640,
} as const;

export const layout = {
  topbarHeight: 44,
  railWidth: 52,
  actionbarHeight: 52,
  dockMin: 300,
  dockDefault: 380,
  dockMax: 640,
} as const;
