/**
 * The controls of a playback: where it is, whether it is paused, and how each control moves it. These are pure
 * functions over a tape, the resolved entries that have beats, oldest first, so the rules are easy to test.
 *
 * - New entries play by themselves when the playback is at rest. An entry that arrives while another plays waits
 *   its turn, so nobody misses the end of a round.
 * - An entry that arrives while the playback is paused replaces the paused one: the playback moves to the start
 *   of the newest entry and stays paused, so a viewer who paused never falls more than a round behind. Stepping
 *   back from there reaches the rounds before it.
 * - Stepping forward or back pauses the playback. Stepping back from rest goes to the last beat of the newest
 *   entry, which replays it one beat at a time.
 * - With reduced motion, nothing plays by itself. A replay starts paused, and the viewer steps through it.
 */
import type { PlaybackSpeed } from '@/app';

/** Each speed's name and how fast it plays: beats last their normal time divided by `rate`. */
export const SPEEDS: Record<PlaybackSpeed, { label: string; rate: number }> = {
  slow: { label: 'Slow', rate: 0.75 },
  normal: { label: 'Normal', rate: 1 },
  fast: { label: 'Fast', rate: 2 },
  fastest: { label: 'Very fast', rate: 3 },
};

/**
 * How long a beat lasts at a speed.
 *
 * @param normalMs - The beat's length at normal speed.
 * @param speed - The viewer's speed.
 */
export function beatLength(normalMs: number, speed: PlaybackSpeed): number {
  return Math.round(normalMs / SPEEDS[speed].rate);
}

/** One entry on the tape: its feed `seq` and how many beats it has. */
export interface TapeEntry {
  seq: number;
  beats: number;
}

export interface TransportState {
  /** The beat on screen, or `null` at rest, when the strip sums up the newest entry. */
  at: { seq: number; index: number } | null;
  /** The newest `seq` that has played or been skipped. Entries after it play when the playback reaches them. */
  done: number;
  /** The newest `seq` the playback has seen, so it can tell when an entry arrives. */
  seen: number;
  paused: boolean;
}

/**
 * The state of a playback that starts with the given entries as history, which never play by themselves.
 *
 * @param afterSeq - Entries after this `seq` are news, and play.
 */
export function startTransport(afterSeq: number): TransportState {
  return { at: null, done: afterSeq, seen: afterSeq, paused: false };
}

function newest(tape: readonly TapeEntry[]): number | null {
  return tape.at(-1)?.seq ?? null;
}

/**
 * Brings the state up to date with the tape: starts an entry that arrived at rest, moves a paused playback to
 * the newest entry, and repairs a position whose entry is gone. Returns the same object when nothing changed.
 *
 * @param state - The state.
 * @param tape - The entries with beats, oldest first.
 * @param autoplay - Whether new entries play by themselves. `false` with reduced motion.
 */
export function syncTransport(
  state: TransportState,
  tape: readonly TapeEntry[],
  autoplay: boolean,
): TransportState {
  let next = state;
  const latest = newest(tape);
  // A position whose entry is gone, or whose beat is past the end, rests or moves to the entry's last beat.
  if (next.at !== null) {
    const { seq, index } = next.at;
    const entry = tape.find((e) => e.seq === seq);
    if (entry === undefined) next = { ...next, at: null, paused: false };
    else if (index >= entry.beats) next = { ...next, at: { seq, index: entry.beats - 1 } };
  }
  const arrived = latest !== null && latest > next.seen;
  if (arrived) {
    if (next.at !== null && next.paused) {
      // A paused viewer moves to the newest entry, paused at its start. The entries in between count as played.
      const before = tape.filter((e) => e.seq < latest).at(-1)?.seq ?? next.done;
      next = { ...next, at: { seq: latest, index: 0 }, done: Math.max(next.done, before) };
    }
    next = { ...next, seen: latest };
  }
  if (next.at === null) {
    const waiting = tape.find((e) => e.seq > next.done);
    if (waiting !== undefined) {
      next =
        autoplay && latest !== null
          ? { ...next, at: { seq: waiting.seq, index: 0 }, paused: false }
          : { ...next, done: latest ?? next.done };
    }
  }
  return next;
}

/** Moves one beat forward along the tape. At the end of the newest entry, the playback rests. */
function forward(state: TransportState, tape: readonly TapeEntry[]): TransportState {
  if (state.at === null) return state;
  const { seq, index } = state.at;
  const position = tape.findIndex((e) => e.seq === seq);
  const entry = tape[position];
  if (entry !== undefined && index + 1 < entry.beats) return { ...state, at: { seq, index: index + 1 } };
  const done = Math.max(state.done, seq);
  const following = tape[position + 1];
  if (following !== undefined) return { ...state, done, at: { seq: following.seq, index: 0 } };
  return { ...state, done, at: null, paused: false };
}

/** The next beat, when the timer runs out. */
export function tick(state: TransportState, tape: readonly TapeEntry[]): TransportState {
  return state.paused ? state : forward(state, tape);
}

/** Pauses on the beat on screen, or resumes from it. Does nothing at rest. */
export function togglePause(state: TransportState): TransportState {
  return state.at === null ? state : { ...state, paused: !state.paused };
}

/** Shows the next beat and pauses there. From the last beat of the newest entry, rests. */
export function stepForward(state: TransportState, tape: readonly TapeEntry[]): TransportState {
  if (state.at === null) return state;
  const next = forward(state, tape);
  return next.at === null ? next : { ...next, paused: true };
}

/**
 * Shows the beat before and pauses there. From the first beat of an entry, it goes to the last beat of the entry
 * before. From rest, it goes to the last beat of the newest entry.
 */
export function stepBack(state: TransportState, tape: readonly TapeEntry[]): TransportState {
  if (state.at === null) {
    const last = tape.at(-1);
    return last === undefined
      ? state
      : { ...state, at: { seq: last.seq, index: last.beats - 1 }, paused: true };
  }
  const { seq, index } = state.at;
  if (index > 0) return { ...state, at: { seq, index: index - 1 }, paused: true };
  const position = tape.findIndex((e) => e.seq === seq);
  const previous = position > 0 ? tape[position - 1] : undefined;
  if (previous === undefined) return { ...state, paused: true };
  return { ...state, at: { seq: previous.seq, index: previous.beats - 1 }, paused: true };
}

/** Jumps to rest past every entry, so the strip sums up the newest one. */
export function skip(state: TransportState, tape: readonly TapeEntry[]): TransportState {
  return { ...state, at: null, paused: false, done: Math.max(state.done, newest(tape) ?? state.done) };
}

/**
 * Plays the newest entry again from its first beat. With reduced motion, the replay starts paused.
 *
 * @param state - The state.
 * @param tape - The entries with beats.
 * @param paused - Whether to start paused.
 */
export function replay(state: TransportState, tape: readonly TapeEntry[], paused: boolean): TransportState {
  const last = tape.at(-1);
  return last === undefined ? state : { ...state, at: { seq: last.seq, index: 0 }, paused };
}
