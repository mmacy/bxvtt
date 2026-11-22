/**
 * What the interface calls a place the adventure keys no area for: a corridor, a bridge deck, or open ground.
 * The scene panel, the map's keyboard cursor, and the referee panel all use these words, so a player and the
 * referee hear the same name. Import this module directly (`@/app/places`) from the map, which doesn't depend on
 * the rest of the app layer.
 */

/** The name as a title, or as a sentence's first words: "On the way". */
export const UNKEYED_PLACE_TITLE = 'On the way';

/** The name inside a sentence: "Level 1, on the way". */
export const UNKEYED_PLACE_PHRASE = 'on the way';
