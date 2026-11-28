/**
 * The confirm for "Return to lobby", which ends the game and keeps the saves. The table menu and the screen for a
 * game that can't be loaded show the same one.
 */
export const RETURN_TO_LOBBY_CONFIRM = {
  title: 'Return to lobby?',
  description:
    'This ends the game for everyone and keeps every save. A new game starts the characters from their first sheets. Continue from a save to keep their experience, treasure, and injuries.',
  confirmLabel: 'Return to lobby',
} as const;
