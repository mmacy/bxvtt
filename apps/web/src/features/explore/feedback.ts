/**
 * Short messages that appear on the map beside the party, such as a refused move, instead of a toast. A new
 * message replaces the last one, so holding an arrow key against a wall shows one calm line, not a stack.
 */
import { create } from 'zustand';
import type { Direction } from '@/map';

export interface MapMessage {
  id: number;
  text: string;
  tone: 'refused' | 'info';
}

interface FeedbackState {
  message: MapMessage | null;
  /** The last refused step, which the map shows as a bump against that side of the party's cell. */
  bump: { id: number; direction: Direction } | null;
  say: (text: string, tone?: MapMessage['tone']) => void;
  bumpInto: (direction: Direction) => void;
  clear: (id: number) => void;
}

let counter = 0;

export const useMapFeedback = create<FeedbackState>()((set, get) => ({
  message: null,
  bump: null,
  say: (text, tone = 'refused') => {
    counter += 1;
    set({ message: { id: counter, text, tone } });
  },
  bumpInto: (direction) => {
    counter += 1;
    set({ bump: { id: counter, direction } });
  },
  clear: (id) => {
    if (get().message?.id === id) set({ message: null });
  },
}));

/** How long a map message stays, in milliseconds: long enough to read, from 2.6 to 7 seconds. */
export function messageDuration(text: string): number {
  return Math.min(7000, Math.max(2600, text.length * 60));
}
