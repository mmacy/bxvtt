import { describe, expect, it } from 'vitest';
import {
  beatLength,
  replay,
  skip,
  SPEEDS,
  startTransport,
  stepBack,
  stepForward,
  syncTransport,
  tick,
  togglePause,
  type TapeEntry,
  type TransportState,
} from './transport';

/** Round 1 (seq 10) was history when the board opened at seq 10. Rounds 2 and 3 arrive later. */
const round1: TapeEntry = { seq: 10, beats: 3 };
const round2: TapeEntry = { seq: 12, beats: 4 };
const round3: TapeEntry = { seq: 15, beats: 2 };

/** Runs the timer out `count` times. */
function ticks(state: TransportState, tape: TapeEntry[], count: number): TransportState {
  let next = state;
  for (let i = 0; i < count; i += 1) next = syncTransport(tick(next, tape), tape, true);
  return next;
}

describe('the playback transport', () => {
  it('leaves history at rest, and plays a new round from its first beat to rest', () => {
    const history = syncTransport(startTransport(10), [round1], true);
    expect(history.at).toBeNull();
    const arrived = syncTransport(history, [round1, round2], true);
    expect(arrived.at).toEqual({ seq: 12, index: 0 });
    expect(arrived.paused).toBe(false);
    const done = ticks(arrived, [round1, round2], 4);
    expect(done.at).toBeNull();
    expect(done.done).toBe(12);
  });

  it('pauses on a beat, stays there when the timer runs out, and resumes from it', () => {
    const tape = [round1, round2];
    const playing = ticks(syncTransport(startTransport(10), tape, true), tape, 1);
    expect(playing.at).toEqual({ seq: 12, index: 1 });
    const paused = togglePause(playing);
    expect(paused.paused).toBe(true);
    expect(tick(paused, tape)).toBe(paused);
    const resumed = togglePause(paused);
    expect(resumed.paused).toBe(false);
    expect(tick(resumed, tape).at).toEqual({ seq: 12, index: 2 });
  });

  it('steps forward and back one beat at a time, pausing, and crosses into the round before', () => {
    const tape = [round1, round2];
    const playing = syncTransport(startTransport(10), tape, true);
    const forward = stepForward(playing, tape);
    expect(forward).toMatchObject({ at: { seq: 12, index: 1 }, paused: true });
    const back = stepBack(stepBack(forward, tape), tape);
    // From the first beat of round 2, a step back lands on the last beat of round 1.
    expect(back).toMatchObject({ at: { seq: 10, index: 2 }, paused: true });
    // The first beat on the tape is as far back as it goes.
    const start = stepBack(stepBack(stepBack(back, tape), tape), tape);
    expect(start.at).toEqual({ seq: 10, index: 0 });
    // Resuming from round 1 plays on into round 2, and then rests.
    const end = ticks(togglePause(start), tape, 3 + 4);
    expect(end.at).toBeNull();
  });

  it('steps back from rest into the last beat of the newest round, which replays it', () => {
    const tape = [round1];
    const rest = syncTransport(startTransport(10), tape, true);
    expect(stepBack(rest, tape)).toMatchObject({ at: { seq: 10, index: 2 }, paused: true });
  });

  it('steps forward off the last beat to rest', () => {
    const tape = [round1, round2];
    const last = { ...syncTransport(startTransport(10), tape, true), at: { seq: 12, index: 3 } };
    expect(stepForward(last, tape)).toMatchObject({ at: null, paused: false, done: 12 });
  });

  it('skips to rest past every round, and a replay plays the newest round again from its start', () => {
    const tape = [round1, round2];
    const skipped = skip(syncTransport(startTransport(10), tape, true), tape);
    expect(skipped).toMatchObject({ at: null, done: 12, paused: false });
    expect(syncTransport(skipped, tape, true).at).toBeNull();
    expect(replay(skipped, tape, false)).toMatchObject({ at: { seq: 12, index: 0 }, paused: false });
  });

  it('lets a round that arrives during playback wait its turn', () => {
    const playing = ticks(syncTransport(startTransport(10), [round1, round2], true), [round1, round2], 2);
    const tape = [round1, round2, round3];
    const queued = syncTransport(playing, tape, true);
    expect(queued.at).toEqual({ seq: 12, index: 2 });
    const next = ticks(queued, tape, 2);
    expect(next.at).toEqual({ seq: 15, index: 0 });
  });

  it('replaces a paused round with a newer one, paused at its start, and keeps the old one a step back', () => {
    const before = [round1, round2];
    const paused = togglePause(ticks(syncTransport(startTransport(10), before, true), before, 1));
    const tape = [round1, round2, round3];
    const moved = syncTransport(paused, tape, true);
    expect(moved).toMatchObject({ at: { seq: 15, index: 0 }, paused: true, seen: 15 });
    expect(moved.done).toBe(12);
    // Nothing more happens until the viewer moves.
    expect(syncTransport(moved, tape, true)).toBe(moved);
    expect(stepBack(moved, tape).at).toEqual({ seq: 12, index: 3 });
  });

  it('does not jump when the viewer pauses while a round is already waiting', () => {
    const tape = [round1, round2, round3];
    const playing = syncTransport(syncTransport(startTransport(10), [round1, round2], true), tape, true);
    expect(playing.at).toEqual({ seq: 12, index: 0 });
    const paused = togglePause(playing);
    expect(syncTransport(paused, tape, true)).toBe(paused);
  });

  it('rests when the round on screen leaves the tape, such as when the battle ends', () => {
    const playing = syncTransport(startTransport(10), [round1, round2], true);
    const gone = syncTransport(togglePause(playing), [round1], true);
    expect(gone).toMatchObject({ at: null, paused: false });
  });

  it('plays nothing by itself with reduced motion, and a replay starts paused', () => {
    const tape = [round1, round2];
    const still = syncTransport(startTransport(10), tape, false);
    expect(still).toMatchObject({ at: null, done: 12 });
    const replayed = replay(still, tape, true);
    expect(replayed).toMatchObject({ at: { seq: 12, index: 0 }, paused: true });
    expect(tick(replayed, tape)).toBe(replayed);
  });
});

describe('playback speeds', () => {
  it('divides each beat by the speed, from slow to very fast', () => {
    expect(beatLength(3000, 'normal')).toBe(3000);
    expect(beatLength(3000, 'slow')).toBe(4000);
    expect(beatLength(3000, 'fast')).toBe(1500);
    expect(beatLength(3000, 'fastest')).toBe(1000);
    const rates = Object.values(SPEEDS).map((speed) => speed.rate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });
});
