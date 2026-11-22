/**
 * Map themes. A theme is plain data: colors, line weights in cells or pixels, and a few style
 * switches the painter reads. Switch themes at run time by passing a different one to the map.
 */

export type ThemeName = 'blueprint' | 'torchlit' | 'parchment';

/** How the painter fills solid rock and unknown space. */
export type RockStyle = 'solid' | 'stone' | 'hatch';

/** How the party's light shows: a ring and a soft glow, or darkness everywhere outside the light. */
export type LightStyle = 'ring' | 'darkness';

export interface MapTheme {
  name: ThemeName;
  /** The name to show in a theme picker. */
  title: string;
  /** Whether the theme is light or dark, for the UI around the map. */
  tone: 'light' | 'dark';
  rock: {
    style: RockStyle;
    color: string;
    /** Grid lines over rock, or `null` for none. */
    grid: string | null;
    /** The ink of hatching or the speckle of stone. */
    detail: string;
    /** How far hatching reaches from a wall, in cells. */
    hatchReach: number;
  };
  floor: {
    color: string;
    /** How much each cell's tone varies, from 0 (flat) to about 0.2. */
    variation: number;
    /** Draws the floor as worn flagstones with cracks. */
    flagstones: boolean;
  };
  grid: {
    color: string;
    /** Line width in device pixels. */
    width: number;
    /** A dash pattern in device pixels, or `null` for a solid line. */
    dash: number[] | null;
  };
  wall: {
    color: string;
    /** Line width as a fraction of a cell. */
    width: number;
    /** The thinnest a wall draws, in CSS pixels. */
    minPx: number;
    /** A dark outline drawn under the wall for depth, or `null`. */
    casing: string | null;
    /** A soft shadow cast on the floor along walls, or `null`. */
    shadow: { color: string; blur: number } | null;
    /** How far a hand-drawn line wanders, in cells. 0 draws ruler-straight lines. */
    wobble: number;
  };
  door: {
    fill: string;
    stroke: string;
    /** Iron bands and hinges. */
    detail: string;
    locked: string;
    stuck: string;
    secret: string;
  };
  /** Stairs, trapdoors, and feature icons. */
  glyph: {
    color: string;
    fill: string;
    accent: string;
    muted: string;
  };
  fog: {
    /** What unknown space looks like beyond an open edge the party hasn't crossed. */
    color: string;
    /** How far floor fades into unknown space past an open edge, in cells. */
    frontier: number;
    /** The veil over floor the party hasn't seen, on a referee map. */
    veil: string;
    veilAlpha: number;
  };
  light: {
    style: LightStyle;
    /** The warm color of the light. */
    color: string;
    glowAlpha: number;
    /** How dark it is outside the light, from 0 to 1, on a player map and on a referee map. */
    darkness: number;
    refereeDarkness: number;
    /** Whether the light flickers like a flame. */
    flicker: boolean;
    ring: string;
  };
  party: {
    fill: string;
    stroke: string;
    facing: string;
  };
  label: {
    color: string;
    halo: string;
    family: string;
    weight: number;
    italic: boolean;
  };
  marker: {
    encounter: string;
    treasure: string;
    trap: string;
    done: string;
  };
  hover: {
    stroke: string;
    fill: string;
  };
  /** Screen-space finishing: paper grain and a vignette. */
  finish: {
    grain: number;
    grainColor: string;
    vignette: number;
    vignetteColor: string;
  };
  /**
   * How user-colored marks (strokes, pings, pins, pointers, and the ruler) stay readable: a thin outline in
   * `casing` under each one. Leave it out and the map picks a dark outline from the theme's tone.
   */
  overlay?: {
    casing: string;
  };
  /** Colors for the tooltip and chips the map draws in HTML. */
  ui: {
    panel: string;
    text: string;
    muted: string;
    border: string;
  };
}

const serif = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const display = '"Cinzel", "Trajan Pro", "Palatino Linotype", Palatino, Georgia, serif';
const geometric = '"Futura", "Avenir Next", "Century Gothic", "Trebuchet MS", system-ui, sans-serif';

export const blueprint: MapTheme = {
  name: 'blueprint',
  title: 'Blueprint',
  tone: 'light',
  rock: {
    style: 'solid',
    color: '#5b8fd0',
    grid: 'rgba(255,255,255,0.13)',
    detail: '#4a7dbd',
    hatchReach: 0,
  },
  floor: { color: '#fbfcfe', variation: 0, flagstones: false },
  grid: { color: '#a9c5ea', width: 1, dash: null },
  wall: { color: '#2d64ad', width: 0.09, minPx: 1.6, casing: null, shadow: null, wobble: 0 },
  door: {
    fill: '#fbfcfe',
    stroke: '#2d64ad',
    detail: '#2d64ad',
    locked: '#2d64ad',
    stuck: '#2d64ad',
    secret: '#1d4f94',
  },
  glyph: { color: '#2d64ad', fill: '#fbfcfe', accent: '#1d4f94', muted: '#8fb0dc' },
  fog: { color: '#5b8fd0', frontier: 0.85, veil: '#6f9bd6', veilAlpha: 0.5 },
  light: {
    style: 'ring',
    color: '#ffb347',
    glowAlpha: 0,
    darkness: 0,
    refereeDarkness: 0,
    flicker: false,
    ring: 'rgba(232, 128, 24, 0.9)',
  },
  party: { fill: '#d7263d', stroke: '#ffffff', facing: '#ffffff' },
  label: { color: '#1d4f94', halo: 'rgba(251,252,254,0.92)', family: geometric, weight: 700, italic: false },
  marker: { encounter: '#c62f3b', treasure: '#c48a0e', trap: '#d9661b', done: '#8a9bb3' },
  hover: { stroke: '#e0821a', fill: 'rgba(255, 176, 64, 0.18)' },
  finish: { grain: 0.035, grainColor: '#1b3d6e', vignette: 0, vignetteColor: '#000000' },
  overlay: { casing: '#0e2647' },
  ui: { panel: 'rgba(251,252,254,0.97)', text: '#14305a', muted: '#4c6a94', border: '#9dbde6' },
};

export const torchlit: MapTheme = {
  name: 'torchlit',
  title: 'Torchlit',
  tone: 'dark',
  rock: { style: 'stone', color: '#0c0a0d', grid: null, detail: '#18141a', hatchReach: 0 },
  floor: { color: '#4a4137', variation: 0.08, flagstones: true },
  grid: { color: 'rgba(8, 6, 4, 0.72)', width: 1.25, dash: null },
  wall: {
    color: '#9a8670',
    width: 0.13,
    minPx: 2,
    casing: '#1a130d',
    shadow: { color: 'rgba(0,0,0,0.85)', blur: 0.3 },
    wobble: 0.006,
  },
  door: {
    fill: '#8d5c33',
    stroke: '#140c06',
    detail: '#2c2014',
    locked: '#e3b552',
    stuck: '#c9643b',
    secret: '#c9b37e',
  },
  glyph: { color: '#e3d3b4', fill: '#2a241f', accent: '#f0c674', muted: '#7d705f' },
  fog: { color: '#060508', frontier: 1.1, veil: '#050407', veilAlpha: 0.62 },
  light: {
    style: 'darkness',
    color: '#ffa94d',
    glowAlpha: 0.34,
    darkness: 0.5,
    refereeDarkness: 0.26,
    flicker: true,
    ring: 'rgba(255, 180, 90, 0.45)',
  },
  party: { fill: '#f3cf72', stroke: '#2a1906', facing: '#2a1906' },
  label: { color: '#f0c674', halo: 'rgba(8,6,4,0.9)', family: display, weight: 600, italic: false },
  marker: { encounter: '#ff6b5a', treasure: '#f3c34f', trap: '#ff9a3c', done: '#6d6457' },
  hover: { stroke: '#ffd27a', fill: 'rgba(255, 196, 92, 0.16)' },
  finish: { grain: 0.06, grainColor: '#000000', vignette: 0.6, vignetteColor: '#000000' },
  overlay: { casing: '#090605' },
  ui: { panel: 'rgba(22,18,15,0.96)', text: '#f2e6cf', muted: '#b8a68a', border: '#5a4a38' },
};

export const parchment: MapTheme = {
  name: 'parchment',
  title: 'Parchment',
  tone: 'light',
  rock: { style: 'hatch', color: '#e8d9b5', grid: null, detail: 'rgba(58, 40, 24, 0.72)', hatchReach: 0.7 },
  floor: { color: '#f4ebd3', variation: 0.025, flagstones: false },
  grid: { color: 'rgba(122, 92, 52, 0.3)', width: 1, dash: [2, 3] },
  wall: {
    color: '#2f2216',
    width: 0.075,
    minPx: 1.5,
    casing: null,
    shadow: { color: 'rgba(90, 60, 30, 0.22)', blur: 0.16 },
    wobble: 0.018,
  },
  door: {
    fill: '#f4ebd3',
    stroke: '#2f2216',
    detail: '#2f2216',
    locked: '#2f2216',
    stuck: '#2f2216',
    secret: '#7a1f14',
  },
  glyph: { color: '#2f2216', fill: '#f4ebd3', accent: '#7a1f14', muted: '#a8916a' },
  fog: { color: '#e8d9b5', frontier: 0.9, veil: '#bfa77a', veilAlpha: 0.42 },
  light: {
    style: 'ring',
    color: '#f2b25c',
    glowAlpha: 0.2,
    darkness: 0,
    refereeDarkness: 0,
    flicker: false,
    ring: 'rgba(122, 31, 20, 0.75)',
  },
  party: { fill: '#8e1f14', stroke: '#f4ebd3', facing: '#f4ebd3' },
  label: { color: '#3a2a19', halo: 'rgba(244,235,211,0.92)', family: serif, weight: 600, italic: true },
  marker: { encounter: '#8e1f14', treasure: '#9a6a12', trap: '#b4521c', done: '#a8916a' },
  hover: { stroke: '#8e1f14', fill: 'rgba(142, 31, 20, 0.1)' },
  finish: { grain: 0.09, grainColor: '#5a3d1c', vignette: 0.42, vignetteColor: '#6b4a22' },
  overlay: { casing: '#24180e' },
  ui: { panel: 'rgba(246,238,216,0.98)', text: '#2f2216', muted: '#6b5538', border: '#c8b089' },
};

export const THEMES: Readonly<Record<ThemeName, MapTheme>> = { blueprint, torchlit, parchment };

export function resolveTheme(theme: ThemeName | MapTheme | undefined): MapTheme {
  if (!theme) return blueprint;
  return typeof theme === 'string' ? THEMES[theme] : theme;
}

/** A canvas font string for a label at `px` CSS pixels. */
export function labelFont(theme: MapTheme, px: number, weight = theme.label.weight): string {
  return `${theme.label.italic ? 'italic ' : ''}${weight} ${px}px ${theme.label.family}`;
}

/** The outline color under user-colored marks on a theme. */
export function casingColor(theme: MapTheme): string {
  return theme.overlay?.casing ?? (theme.tone === 'dark' ? '#000000' : '#151a22');
}
