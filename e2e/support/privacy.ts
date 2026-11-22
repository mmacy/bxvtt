/**
 * Markers of referee-only data, and a scan of everything a player's browser received for them. A player must
 * never receive referee data, so any marker in a player's HTTP bodies or WebSocket frames is a leak.
 */

/**
 * Structural markers of referee data in JSON: referee events and feed entries, secret rolls, the referee view's
 * fields, and referee-only event codes. Copied from `REFEREE_MARKERS` in `apps/server/test/helpers.ts`, which the
 * server's privacy tests use, because importing that file would start pulling in the server.
 */
export const STRUCTURAL_MARKERS = [
  '"visibility":"referee',
  '"secret":true',
  '"dungeon_state"',
  '"command_log"',
  '"event_log"',
  '"listener_state"',
  '"allocator"',
  '"ledger"',
  '"fired_triggers"',
  '"treasure_snapshot_cp"',
  '"defeated_monsters"',
  '"monster_ids"',
  'hoard_generated',
  'surprise_rolled',
  'reaction_rolled',
];

/**
 * Text from referee-only fields of The Drowned Bell (`adventures/src/the-drowned-bell.mjs`): level guidance, the
 * referee's side of trigger narratives, cache descriptions, wandering monster tables, hidden objectives, and the
 * disguised monster's true name and intro.
 */
export const BELL_MARKERS = [
  // Level guidance.
  'The Drain Folk kobolds are hungry and afraid of the goblins',
  'The sluice drains the flooded stair to the belfry',
  'he is a drowned miser who cannot let go',
  // The referee's side of trigger narratives.
  'Describe the bell: one note, felt through the soles of the feet',
  'The kobolds will talk if the party lets them',
  'The surviving goblins check morale at a penalty',
  // Cache descriptions, which the scene never shows.
  'Two silver candlesticks, two stoppered flasks of holy water',
  'an old iron key whose bow is shaped like a bell',
  'A greasy sack of coins taken from ferry passengers',
  "The prior's treasure, sunk in the pool at his feet",
  // A trap's referee instructions.
  'drops chest-deep into the water below',
  // Wandering monster tables.
  'Priory undercroft',
  'Wreck robbers',
  // Objectives that stay hidden until the party learns of them.
  'Learn where the brothers hid the Hand',
  'Lay the drowned prior to rest',
  // The disguised monster's true name and intro.
  'Drowned Prior',
  'Hadric Vole',
  'who drowned with his treasure rather than leave it',
];

/** One marker found in what a player received. */
export interface Leak {
  marker: string;
  context: string;
}

/**
 * Finds markers in a player's received HTTP bodies and WebSocket frames.
 *
 * @param received - The bodies and frames, as text.
 * @param markers - The markers to look for.
 * @returns One finding per marker, with the text around its first appearance.
 */
export function findLeaks(received: string[], markers: string[]): Leak[] {
  const leaks: Leak[] = [];
  for (const marker of markers) {
    for (const text of received) {
      const index = text.indexOf(marker);
      if (index < 0) continue;
      leaks.push({ marker, context: text.slice(Math.max(0, index - 120), index + marker.length + 120) });
      break;
    }
  }
  if (received.some((text) => /"referee":\{/.test(text))) {
    leaks.push({ marker: '"referee":{', context: 'a referee state in a game message' });
  }
  return leaks;
}
