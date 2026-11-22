/**
 * The map interaction bus: how features talk to the map without importing each other.
 *
 * - **Picks.** A feature that needs a place on the map (the referee placing the party, or setting a door) calls
 *   `requestPick({ kind: 'cell', prompt })` and awaits the target. The map stage reads `pick`, switches to the
 *   matching pick mode, and calls `fulfilPick(target)` on a click or `cancelPick()` on Escape. The shell shows
 *   the prompt with a cancel button over the stage.
 * - **The active tool**, which the tool rail sets and the map reads.
 * - **Focus requests.** Any feature calls `requestFocus({ kind: 'member', memberId })` to center the map on a
 *   party member, the party, or a cell. The map reads `focus`, moves the camera, and calls `clearFocus(id)`.
 * - **The viewed level**, which the map sets when the user looks at another level than the party's, so the
 *   annotations and the minimap can follow it.
 *
 * Read it with a selector: `const tool = useMapBus((s) => s.tool)`.
 */
import type { LevelRef } from '@bxvtt/shared/protocol';
import { create } from 'zustand';

/** A side of a cell, as bxapi names directions. */
export type MapDirection = 'north' | 'east' | 'south' | 'west';

/** The tools of the map's tool rail. */
export type MapToolId = 'select' | 'pan' | 'ruler' | 'draw' | 'erase' | 'ping' | 'pin';

/** A cell the user picked. */
export interface CellPick {
  kind: 'cell';
  dungeon_id: string;
  level_number: number;
  x: number;
  y: number;
}

/** A cell side (a door, a wall, or a passage) the user picked. `direction` is the side of cell `x`, `y`. */
export interface EdgePick {
  kind: 'edge';
  dungeon_id: string;
  level_number: number;
  x: number;
  y: number;
  direction: MapDirection;
}

/** What a pick resolves to. */
export type PickTarget = CellPick | EdgePick;

/** What a feature asks the map for. */
export interface PickOptions {
  kind: 'cell' | 'edge';
  /** One sentence that tells the user what to click, such as "Pick the cell to place the party on." */
  prompt: string;
}

/** The pick the map is waiting for. */
export interface PickRequest extends PickOptions {
  id: number;
}

/** What to center the map on. */
export type FocusTarget =
  | { kind: 'party' }
  | { kind: 'member'; memberId: string }
  | { kind: 'cell'; dungeon_id: string; level_number: number; x: number; y: number };

export interface FocusRequest {
  id: number;
  target: FocusTarget;
}

export interface MapBusState {
  tool: MapToolId;
  setTool: (tool: MapToolId) => void;
  /** The pick the map is waiting for, or `null`. */
  pick: PickRequest | null;
  /**
   * Asks the user to pick a cell or an edge on the map. A new request cancels the previous one.
   *
   * @returns The target, or `null` when the user cancels.
   */
  requestPick: (options: PickOptions) => Promise<PickTarget | null>;
  /** Resolves the open pick. The map calls it. A target of the wrong kind is ignored. */
  fulfilPick: (target: PickTarget) => void;
  /** Cancels the open pick, which resolves to `null`. */
  cancelPick: () => void;
  /** The latest focus request, or `null`. */
  focus: FocusRequest | null;
  requestFocus: (target: FocusTarget) => void;
  /** Clears a focus request once the map has handled it. */
  clearFocus: (id: number) => void;
  /** The level the map shows, or `null` when it follows the party. */
  viewedLevel: LevelRef | null;
  setViewedLevel: (level: LevelRef | null) => void;
  /** Returns the bus to its starting state, when the user leaves a table. */
  reset: () => void;
}

let nextId = 1;
let resolvePick: ((target: PickTarget | null) => void) | null = null;

export const useMapBus = create<MapBusState>()((set, get) => ({
  tool: 'select',
  setTool: (tool) => set({ tool }),

  pick: null,
  requestPick: (options) => {
    resolvePick?.(null);
    const id = nextId++;
    return new Promise<PickTarget | null>((resolve) => {
      resolvePick = (target) => {
        resolvePick = null;
        if (get().pick?.id === id) set({ pick: null });
        resolve(target);
      };
      set({ pick: { ...options, id } });
    });
  },
  fulfilPick: (target) => {
    const pick = get().pick;
    if (pick === null || pick.kind !== target.kind) return;
    resolvePick?.(target);
  },
  cancelPick: () => resolvePick?.(null),

  focus: null,
  requestFocus: (target) => set({ focus: { id: nextId++, target } }),
  clearFocus: (id) => {
    if (get().focus?.id === id) set({ focus: null });
  },

  viewedLevel: null,
  setViewedLevel: (level) => set({ viewedLevel: level }),

  reset: () => {
    resolvePick?.(null);
    set({ tool: 'select', pick: null, focus: null, viewedLevel: null });
  },
}));
