/**
 * Display preferences, kept in `localStorage` for this browser: the map theme, the dock, the referee lens,
 * sound, and motion. They change only how this browser shows the table, never what the server sends.
 */
import { create } from 'zustand';
import { useReducedMotion } from '@/ui';
import { STORAGE_KEYS, readStored, writeStored } from './storage';

/** The map themes the canvas renderer offers. */
export type MapThemeName = 'blueprint' | 'torchlit' | 'parchment';

/** The dock tabs of the play screen. */
export type DockTabId = 'party' | 'feed' | 'journal' | 'referee';

/** `system` follows the operating system's reduced motion setting. */
export type MotionPreference = 'system' | 'reduce' | 'full';

export interface Preferences {
  mapTheme: MapThemeName;
  /** The dock's width in pixels. */
  dockWidth: number;
  dockCollapsed: boolean;
  dockTab: DockTabId;
  /**
   * Whether a referee sees referee data. With the lens off, every referee-only hook returns nothing, so a
   * referee who also plays can avoid spoilers. Players never have referee data, whatever this says.
   */
  refereeLens: boolean;
  /** Whether the table plays sounds, such as dice and a ping. */
  sound: boolean;
  motion: MotionPreference;
}

export const DEFAULT_PREFERENCES: Preferences = {
  mapTheme: 'blueprint',
  dockWidth: 380,
  dockCollapsed: false,
  dockTab: 'party',
  refereeLens: true,
  sound: true,
  motion: 'system',
};

const VALIDATORS: { [K in keyof Preferences]: (value: unknown) => value is Preferences[K] } = {
  mapTheme: (v): v is MapThemeName => v === 'blueprint' || v === 'torchlit' || v === 'parchment',
  dockWidth: (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 200 && v <= 1000,
  dockCollapsed: (v): v is boolean => typeof v === 'boolean',
  dockTab: (v): v is DockTabId => v === 'party' || v === 'feed' || v === 'journal' || v === 'referee',
  refereeLens: (v): v is boolean => typeof v === 'boolean',
  sound: (v): v is boolean => typeof v === 'boolean',
  motion: (v): v is MotionPreference => v === 'system' || v === 'reduce' || v === 'full',
};

function readPreferences(): Preferences {
  const stored = readStored(STORAGE_KEYS.preferences);
  const result: Preferences = { ...DEFAULT_PREFERENCES };
  if (typeof stored !== 'object' || stored === null) return result;
  const record = stored as Record<string, unknown>;
  for (const key of Object.keys(VALIDATORS) as (keyof Preferences)[]) {
    const value = record[key];
    if (VALIDATORS[key](value)) (result as Record<keyof Preferences, unknown>)[key] = value;
  }
  return result;
}

interface PreferencesState extends Preferences {
  /** Sets one preference and stores it. */
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  /** Restores every default. */
  reset: () => void;
}

/**
 * The preferences store. Read one value with a selector, and change it with `set`:
 *
 * ```tsx
 * const theme = usePreferences((s) => s.mapTheme);
 * const setPreference = usePreferences((s) => s.set);
 * setPreference('mapTheme', 'torchlit');
 * ```
 */
export const usePreferences = create<PreferencesState>()((set, get) => ({
  ...readPreferences(),
  set: (key, value) => {
    set({ [key]: value } as Partial<PreferencesState>);
    const { set: _set, reset: _reset, ...values } = get();
    writeStored(STORAGE_KEYS.preferences, values);
  },
  reset: () => {
    set({ ...DEFAULT_PREFERENCES });
    writeStored(STORAGE_KEYS.preferences, null);
  },
}));

/** Whether to reduce motion: the user's choice here, or the system setting when they chose `system`. */
export function useReduceMotion(): boolean {
  const preference = usePreferences((s) => s.motion);
  const system = useReducedMotion();
  return preference === 'system' ? system : preference === 'reduce';
}
