/**
 * The shared drawings and pins of one level: what the map draws, and the requests that change them. The server
 * pushes every change to the whole table, and this hook also applies its own changes as soon as the server
 * answers, so a stroke never flickers out between the request and the push.
 */
import type { Annotation, LevelAnnotations, LevelRef, PinAnnotation } from '@bxvtt/shared/protocol';
import { LIMITS } from '@bxvtt/shared/protocol';
import { useCallback, useMemo, useState } from 'react';
import {
  getApi,
  useAnnotations,
  useApiAction,
  useIsReferee,
  useRefereeLens,
  useTableStoreApi,
  useTableUser,
} from '@/app';
import type { MapPin, MapStroke } from '@/map';
import { toast } from '@/ui';

/** The default stroke width, in cells. */
export const STROKE_WIDTH = 0.09;

/**
 * Rounds a stroke's points and thins a long stroke to the server's limit, keeping its first and last points.
 *
 * @param points - The points in cells.
 */
export function prepareStroke(points: readonly (readonly [number, number])[]): [number, number][] {
  const rounded = points.map(
    ([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number],
  );
  const max = LIMITS.strokePoints;
  if (rounded.length <= max) return rounded;
  const out: [number, number][] = [];
  const stride = (rounded.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    const point = rounded[Math.round(i * stride)];
    if (point) out.push(point);
  }
  return out;
}

function merge(current: LevelAnnotations | null, level: LevelRef, added: Annotation): LevelAnnotations {
  const items = current?.items ?? [];
  if (items.some((item) => item.id === added.id)) return current ?? { ...level, items };
  return { ...level, items: [...items, added] };
}

export interface MapAnnotations {
  /** Every annotation of the level, or `null` while they load. */
  items: readonly Annotation[] | null;
  strokes: MapStroke[];
  pins: MapPin[];
  /** The pins with their author and visibility, by ID. */
  pinRecords: ReadonlyMap<string, PinAnnotation>;
  /** Whether the annotations of the level have loaded. */
  loaded: boolean;
  addStroke: (points: readonly (readonly [number, number])[], color: string, width: number) => void;
  /**
   * Erases the strokes the user may erase. Returns the ones it kept, so the map can show them again: other
   * people's strokes, and a stroke still on its way to the server.
   */
  erase: (ids: readonly string[]) => string[];
  addPin: (x: number, y: number, text: string, refereesOnly: boolean) => Promise<boolean>;
  removePin: (id: string) => Promise<boolean>;
  /** Whether the user may erase an annotation: its author or a referee. */
  mayErase: (authorId: string) => boolean;
}

/**
 * The annotations of the level the map shows.
 *
 * @param level - The level, or `null` when the map shows none.
 */
export function useMapAnnotations(level: LevelRef | null): MapAnnotations {
  const annotations = useAnnotations(level);
  const store = useTableStoreApi();
  const me = useTableUser();
  const referee = useIsReferee();
  const lens = useRefereeLens();
  const { run } = useApiAction();
  const [pending, setPending] = useState<MapStroke[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const items = annotations?.items;
  const strokes = useMemo(() => {
    const committed: MapStroke[] = (items ?? []).flatMap((item) =>
      item.kind === 'stroke' && !hidden.has(item.id)
        ? [
            {
              id: item.id,
              points: item.points.map(([x, y]) => [x, y] as [number, number]),
              color: item.color,
              width: item.width,
            },
          ]
        : [],
    );
    return pending.length > 0 ? [...committed, ...pending] : committed;
  }, [items, hidden, pending]);

  const pinRecords = useMemo(() => {
    const map = new Map<string, PinAnnotation>();
    for (const item of items ?? []) {
      // With the lens off, a referee sees what the players see, so referee-only pins stay out.
      if (item.kind === 'pin' && (item.visibility === 'everyone' || lens)) map.set(item.id, item);
    }
    return map;
  }, [items, lens]);

  // Public pins count 1, 2, 3 for everyone, and referee-only pins count R1, R2, so a number means the same pin
  // to every member who can see it.
  const pins = useMemo(() => {
    let everyone = 0;
    let referees = 0;
    return [...pinRecords.values()].map((pin) => {
      const refereeOnly = pin.visibility === 'referees';
      const label = refereeOnly ? `R${(referees += 1)}` : String((everyone += 1));
      return {
        id: pin.id,
        x: pin.x,
        y: pin.y,
        label,
        note: pin.text || undefined,
        color: pin.color,
        refereeOnly,
      };
    });
  }, [pinRecords]);

  const mayErase = useCallback((authorId: string) => referee || authorId === me?.id, [referee, me?.id]);

  const receive = useCallback(
    (added: Annotation) => {
      if (level === null) return;
      const key = `${level.dungeon_id}:${level.level_number}`;
      const current = store.getState().annotations[key] ?? null;
      store.getState().receiveAnnotations(merge(current, level, added));
    },
    [store, level],
  );

  const addStroke = useCallback(
    (points: readonly (readonly [number, number])[], color: string, width: number) => {
      if (level === null || points.length === 0) return;
      const prepared = prepareStroke(points);
      const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setPending((list) => [...list, { id, points: prepared, color, width }]);
      void run(
        () =>
          getApi().createAnnotation(store.getState().tableId, {
            kind: 'stroke',
            dungeon_id: level.dungeon_id,
            level_number: level.level_number,
            points: prepared,
            width: Math.min(5, Math.max(0.02, width)),
          }),
        { errorTitle: "Your drawing wasn't saved" },
      ).then((result) => {
        if (result.ok) receive(result.value);
        setPending((list) => list.filter((stroke) => stroke.id !== id));
      });
    },
    [level, run, store, receive],
  );

  const erase = useCallback(
    (ids: readonly string[]): string[] => {
      const records = new Map((items ?? []).map((item) => [item.id, item]));
      const mine = ids.filter((id) => {
        const record = records.get(id);
        return record !== undefined && mayErase(record.author_id);
      });
      const kept = ids.filter((id) => !mine.includes(id));
      if (kept.some((id) => records.has(id))) {
        toast.info('You can erase only your own drawings.', {
          id: 'explore-erase-others',
          description: 'The referee can erase anyone’s.',
        });
      }
      if (mine.length === 0) return kept;
      setHidden((set) => new Set([...set, ...mine]));
      for (const id of mine) {
        void run(() => getApi().deleteAnnotation(store.getState().tableId, id), {
          errorTitle: "That drawing couldn't be erased",
        }).then((result) => {
          if (!result.ok) {
            setHidden((set) => {
              const next = new Set(set);
              next.delete(id);
              return next;
            });
          }
        });
      }
      return kept;
    },
    [items, mayErase, run, store],
  );

  const addPin = useCallback(
    async (x: number, y: number, text: string, refereesOnly: boolean) => {
      if (level === null) return false;
      const result = await run(
        () =>
          getApi().createAnnotation(store.getState().tableId, {
            kind: 'pin',
            dungeon_id: level.dungeon_id,
            level_number: level.level_number,
            x: Math.round(x * 1000) / 1000,
            y: Math.round(y * 1000) / 1000,
            text: text.trim(),
            ...(refereesOnly ? { visibility: 'referees' as const } : {}),
          }),
        { errorTitle: "The pin wasn't placed" },
      );
      if (result.ok) receive(result.value);
      return result.ok;
    },
    [level, run, store, receive],
  );

  const removePin = useCallback(
    async (id: string) => {
      setHidden((set) => new Set([...set, id]));
      const result = await run(() => getApi().deleteAnnotation(store.getState().tableId, id), {
        errorTitle: "The pin couldn't be removed",
      });
      if (!result.ok) {
        setHidden((set) => {
          const next = new Set(set);
          next.delete(id);
          return next;
        });
      }
      return result.ok;
    },
    [run, store],
  );

  const visiblePins = useMemo(() => pins.filter((pin) => !hidden.has(pin.id)), [pins, hidden]);

  return {
    items: items ?? null,
    strokes,
    pins: visiblePins,
    pinRecords,
    loaded: annotations !== null,
    addStroke,
    erase,
    addPin,
    removePin,
    mayErase,
  };
}
