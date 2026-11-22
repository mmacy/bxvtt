import type { ParamMap, ParamValue } from '@bxvtt/shared/text';

function isParamValue(value: unknown): value is ParamValue {
  if (typeof value === 'string' || typeof value === 'number') return true;
  return Array.isArray(value) && value.every((item) => typeof item === 'string' || typeof item === 'number');
}

/**
 * Keeps the params of a rejection that the text layer can read: strings, numbers, and lists of them. bxvtt's
 * protocol types params as `unknown`, and the text layer's templates read only those kinds.
 *
 * @param params - The rejection's params.
 */
export function toParamMap(params: Record<string, unknown> | undefined): ParamMap {
  const map: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(params ?? {})) if (isParamValue(value)) map[key] = value;
  return map;
}
