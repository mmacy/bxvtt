import { z } from 'zod';
import { LIMITS, LevelRef, MapCoordinate, Timestamp, UserColor, UserId } from './common';

/** A point on the map, in cell coordinates: `[x, y]`. */
export const MapPoint = z.tuple([MapCoordinate, MapCoordinate]);
/** A point on the map. */
export type MapPoint = z.infer<typeof MapPoint>;

/** Who can see a pin: `everyone` at the table, or `referees` only. */
export const PinVisibility = z.enum(['everyone', 'referees']);
/** Who can see a pin. */
export type PinVisibility = z.infer<typeof PinVisibility>;

/** A freehand stroke on a dungeon level. Strokes are visible to everyone. */
export const StrokeAnnotation = z.object({
  id: z.string(),
  kind: z.literal('stroke'),
  dungeon_id: z.string(),
  level_number: z.number().int(),
  author_id: UserId,
  created_at: Timestamp,
  points: z.array(MapPoint),
  color: UserColor,
  /** Line width in cells. */
  width: z.number(),
});
/** A freehand stroke. */
export type StrokeAnnotation = z.infer<typeof StrokeAnnotation>;

/** A pin with a short note at one point of a dungeon level. */
export const PinAnnotation = z.object({
  id: z.string(),
  kind: z.literal('pin'),
  dungeon_id: z.string(),
  level_number: z.number().int(),
  author_id: UserId,
  created_at: Timestamp,
  x: z.number(),
  y: z.number(),
  text: z.string(),
  color: UserColor,
  visibility: PinVisibility,
});
/** A pin with a short note. */
export type PinAnnotation = z.infer<typeof PinAnnotation>;

/** One map annotation. */
export const Annotation = z.discriminatedUnion('kind', [StrokeAnnotation, PinAnnotation]);
/** One map annotation. */
export type Annotation = z.infer<typeof Annotation>;

/**
 * Every annotation on one dungeon level that the reader may see, oldest first. The `annotations` WebSocket
 * message carries the same object after each change to the level.
 */
export const LevelAnnotations = z.object({
  dungeon_id: z.string(),
  level_number: z.number().int(),
  items: z.array(Annotation),
});
/** Every annotation on one dungeon level that the reader may see. */
export type LevelAnnotations = z.infer<typeof LevelAnnotations>;

/** Query of `GET /api/tables/{table_id}/annotations`: the level to read. */
export const AnnotationsQuery = LevelRef;

/** Body of `POST /api/tables/{table_id}/annotations` for a stroke. The color defaults to the author's color. */
export const CreateStrokeRequest = LevelRef.extend({
  kind: z.literal('stroke'),
  points: z.array(MapPoint).min(1).max(LIMITS.strokePoints),
  color: UserColor.optional(),
  width: z.number().min(0.02).max(5),
});

/** Body of `POST /api/tables/{table_id}/annotations` for a pin. Only a referee may make a `referees` pin. */
export const CreatePinRequest = LevelRef.extend({
  kind: z.literal('pin'),
  x: MapCoordinate,
  y: MapCoordinate,
  text: z.string().trim().max(LIMITS.pinText),
  color: UserColor.optional(),
  visibility: PinVisibility.optional(),
});

/** Body of `POST /api/tables/{table_id}/annotations`. */
export const CreateAnnotationRequest = z.discriminatedUnion('kind', [
  CreateStrokeRequest.strict(),
  CreatePinRequest.strict(),
]);
/** Body of `POST /api/tables/{table_id}/annotations`. */
export type CreateAnnotationRequest = z.infer<typeof CreateAnnotationRequest>;

/** Body of `POST /api/tables/{table_id}/annotations/clear`: erase every annotation on a level. Referee only. */
export const ClearAnnotationsRequest = LevelRef.strict();
/** Body of `POST /api/tables/{table_id}/annotations/clear`. */
export type ClearAnnotationsRequest = z.infer<typeof ClearAnnotationsRequest>;

/** A ping: a short-lived marker at one map point, which every member sees for a few seconds. */
export const MapPing = z.object({
  dungeon_id: z.string().min(1).max(100),
  level_number: z.number().int().min(1).max(1000),
  x: MapCoordinate,
  y: MapCoordinate,
});
/** A ping. */
export type MapPing = z.infer<typeof MapPing>;
