/**
 * Plays back the game entries that arrive in the feed while a combat overlay is open: one beat at a time, at a
 * pace the table can follow, skippable, and instant with reduced motion.
 */
import type { GameEntry } from '@bxvtt/shared/protocol';
import { describeGameEntry, extendContextWithEntryNames, idKind, type EventLine } from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MemberView } from '@bxvtt/shared/bxapi';
import {
  useCombatStage,
  useEncounter,
  useFeed,
  useReduceMotion,
  useRefereeLens,
  useRefereeState,
  useTableId,
  type PlaybackMemberState,
} from '@/app';
import { learnMonsterGroups, snapshotBefore, useCombatMemory } from './memory';
import {
  buildBeats,
  digestRound,
  monsterGroupsFromRound,
  trackFromView,
  trackStates,
  type AnyEvent,
  BEAT_MS,
  type Beat,
  type MonsterGroupLookup,
  type RoundDigest,
  type TrackState,
} from './playback';
import { useCombatText } from './text';

/**
 * Finds the group of a monster: from the referee state for a referee with the lens on, and otherwise from what
 * the round's declarations and events revealed, or the encounter's only group.
 */
export function useMonsterLookup(): MonsterGroupLookup {
  const tableId = useTableId();
  const referee = useRefereeState();
  const encounter = useEncounter();
  const learned = useCombatMemory((s) => s.monsterGroups);
  const ctx = useCombatText();
  return useMemo(() => {
    const exact = new Map<string, string>();
    for (const group of referee?.encounter?.groups ?? []) {
      for (const monsterId of group.monster_ids) exact.set(monsterId, group.id);
    }
    const groups = encounter?.groups ?? [];
    return (monsterId: string) => {
      const known = exact.get(monsterId) ?? learned[`${tableId}:${monsterId}`];
      if (known) return known;
      if (groups.length === 1) return groups[0]?.id ?? null;
      const label = ctx.monsters[monsterId]?.label;
      if (label) {
        const matches = groups.filter((g) => g.label === label);
        if (matches.length === 1) return matches[0]?.id ?? null;
      }
      return null;
    };
  }, [referee, encounter, learned, tableId, ctx]);
}

/** One beat for each line, for an entry the text layer narrates as a whole. */
function linesToBeats(lines: readonly EventLine[]): Beat[] {
  return lines.map((line, index) => ({
    index,
    events: [],
    lines: [line],
    durationMs: BEAT_MS.base,
    pops: [],
    focus: [],
    roll: null,
    referee: line.visibility === 'referee',
  }));
}

/** The group each member last declared against, from the remembered declarations. */
function declaredGroups(tableId: string): Record<string, { target_group_id?: string | null }> {
  const memory = useCombatMemory.getState().declarations;
  const declared: Record<string, { target_group_id?: string | null }> = {};
  for (const [key, value] of Object.entries(memory)) {
    const at = key.lastIndexOf(':');
    const member = key.slice(at + 1);
    if (key.slice(0, at) === tableId && idKind(member) === 'character')
      declared[member] = value.declaration as { target_group_id?: string | null };
  }
  return declared;
}

/** A played or playing entry. */
export interface PlaybackItem {
  seq: number;
  commandType: string | null;
  events: AnyEvent[];
  beats: Beat[];
  /** The battlefield after each beat. */
  states: TrackState[];
  /** The battlefield before the first beat. */
  start: TrackState | null;
  digest: RoundDigest;
  /** The game clock, in rounds, before the entry's command ran, when the feed recorded it. */
  clockBefore: number | null;
}

export interface PlaybackView {
  /** The entry playing now, or `null`. */
  current: PlaybackItem | null;
  /** The beat on screen, or `null` when nothing is playing. */
  beat: Beat | null;
  beatIndex: number;
  /** The battlefield as the playback has it, or `null` to show the view. */
  track: TrackState | null;
  /** The last entry that finished playing, for the summary. */
  last: PlaybackItem | null;
  playing: boolean;
  skip: () => void;
  replay: () => void;
}

/** Plays every game entry. */
export const ACCEPT_ALL = (): boolean => true;

export interface PlaybackOptions {
  /** Which game entries to play. Pass a stable function, such as `ACCEPT_ALL` or one from `useCallback`. */
  accept: (entry: GameEntry) => boolean;
  /** Plays entries already in the feed after this `seq` too. Defaults to the newest entry at mount. */
  afterSeq?: number;
  /** Shows the newest accepted entry from before `afterSeq` as the last summary, without playing it. */
  history?: boolean;
  /** The oldest `seq` the history entry may have, such as the entry that started the battle. */
  historyFrom?: number;
}

/**
 * Plays the accepted game entries that arrive while the component is mounted.
 *
 * @param options - Which entries to play.
 */
export function usePlayback(options: PlaybackOptions): PlaybackView {
  const feed = useFeed();
  const tableId = useTableId();
  const reduce = useReduceMotion();
  const lens = useRefereeLens();
  const ctx = useCombatText();
  const lookup = useMonsterLookup();
  // Entries already in the feed when the overlay opens are history, not news.
  const [startSeq] = useState(() => options.afterSeq ?? feed.at(-1)?.seq ?? 0);
  const [done, setDone] = useState(startSeq);
  // Entries at or below the floor never play by themselves. A replay lowers it, so the history entry can replay.
  const [floor, setFloor] = useState(startSeq);
  const [cursor, setCursor] = useState<{ seq: number; index: number } | null>(null);
  const accept = options.accept;

  const entries = useMemo(() => {
    const games = feed.filter((entry): entry is GameEntry => entry.kind === 'game' && accept(entry));
    // The newest entry from before the overlay opened stays readable as the last summary, without playing.
    const history = games
      .filter((entry) => entry.seq <= startSeq && entry.seq >= (options.historyFrom ?? 0))
      .at(-1);
    const fresh = games.filter((entry) => entry.seq > startSeq);
    return history && options.history ? [history, ...fresh] : fresh;
  }, [feed, startSeq, accept, options.history, options.historyFrom]);

  // What the round's attacks and spells reveal about which monster is in which group.
  useEffect(() => {
    const declared = declaredGroups(tableId);
    for (const entry of entries)
      learnMonsterGroups(tableId, monsterGroupsFromRound(entry.events as AnyEvent[], declared));
  }, [entries, tableId]);

  const items = useMemo(
    () =>
      entries.map((entry): PlaybackItem => {
        const events = entry.events as AnyEvent[];
        // The entry's own names label each monster by its group, even after a reload or once the encounter
        // has closed. The round's attacks and spells, and those labels, place each monster's numbers on its group.
        const named = extendContextWithEntryNames(ctx, entry.names);
        const before = snapshotBefore(tableId, entry.revision);
        const pairs = new Map(monsterGroupsFromRound(events, declaredGroups(tableId)));
        const groups = before?.encounter?.groups ?? [];
        const local = (id: string) => {
          const known = pairs.get(id) ?? lookup(id);
          if (known) return known;
          const label = named.monsters[id]?.label;
          const matches = label ? groups.filter((g) => g.label === label) : [];
          return matches.length === 1 ? (matches[0]?.id ?? null) : null;
        };
        // A parley is narrated as a whole by the text layer, with the speaker the entry names.
        // A parley, and an entry whose events say nothing (a wait while the monsters hold back), are narrated as
        // a whole by the text layer, so the panel and the feed say the same sentence.
        const whole = () => linesToBeats(describeGameEntry(entry, ctx, lens ? {} : { only: 'player' }));
        const built =
          entry.command_type === 'parley'
            ? whole()
            : buildBeats(events, named, { includeReferee: lens, messages: entry.messages, lookup: local });
        const beats = built.length > 0 ? built : whole();
        const start = before ? trackFromView(before.encounter, before.party) : null;
        return {
          seq: entry.seq,
          commandType: entry.command_type,
          events,
          beats,
          start,
          states: start ? trackStates(start, beats, local) : [],
          digest: digestRound(events, local),
          clockBefore:
            feed
              .filter((e): e is GameEntry => e.kind === 'game' && e.seq < entry.seq)
              .map((e) => e.clock_rounds)
              .filter((c): c is number => typeof c === 'number')
              .at(-1) ?? null,
        };
      }),
    [entries, ctx, lens, lookup, tableId, feed],
  );

  const current = reduce
    ? null
    : (items.find((item) => item.seq > done && item.seq > floor && item.beats.length > 0) ?? null);
  const beatIndex = current !== null && cursor?.seq === current.seq ? cursor.index : 0;
  const beat = current?.beats[beatIndex] ?? null;
  const last =
    [...items].reverse().find((item) => item !== current && (current === null || item.seq < current.seq)) ??
    null;
  const currentSeq = current?.seq ?? null;
  const beatCount = current?.beats.length ?? 0;
  const duration = beat?.durationMs ?? 0;

  useEffect(() => {
    if (currentSeq === null) return;
    const timer = setTimeout(() => {
      if (beatIndex + 1 < beatCount) setCursor({ seq: currentSeq, index: beatIndex + 1 });
      else {
        setCursor(null);
        setDone(currentSeq);
      }
    }, duration);
    return () => clearTimeout(timer);
  }, [currentSeq, beatIndex, beatCount, duration]);

  const newest = items.at(-1)?.seq ?? null;
  const skip = useCallback(() => {
    if (newest !== null) setDone((d) => Math.max(d, newest));
    setCursor(null);
  }, [newest]);

  const lastSeq = last?.seq ?? null;
  const replayFrom =
    lastSeq === null ? null : (items.filter((item) => item.seq < lastSeq).at(-1)?.seq ?? lastSeq - 1);
  const replay = useCallback(() => {
    if (replayFrom === null || reduce) return;
    setCursor(null);
    setDone(replayFrom);
    setFloor((f) => Math.min(f, replayFrom));
  }, [replayFrom, reduce]);

  const track =
    current !== null && current.start !== null ? (current.states[beatIndex] ?? current.start) : null;
  return { current, beat, beatIndex, track, last, playing: current !== null, skip, replay };
}

/**
 * Tells the shell about a playback: whether it runs, so the end screen and the party panel wait for it; the round
 * and clock it shows, for the top bar; and each member's hit points and conditions at the beat on screen, for the
 * party panel. Everything clears when the playback ends or the component unmounts.
 *
 * @param playback - The playback.
 * @param party - The party's sheets, for each member's maximum hit points.
 */
export function usePublishPlayback(playback: PlaybackView, party: readonly MemberView[]): void {
  const setPlaying = useCombatStage((s) => s.setPlaying);
  const setMoment = useCombatStage((s) => s.setMoment);
  const setMemberStates = useCombatStage((s) => s.setMemberStates);
  useEffect(() => setPlaying(playback.playing), [playback.playing, setPlaying]);
  const round = playback.current?.digest.round ?? null;
  const clock = playback.current?.clockBefore ?? null;
  useEffect(() => {
    if (playback.playing && clock !== null) setMoment({ round, clockRounds: clock });
    else setMoment(null);
  }, [playback.playing, round, clock, setMoment]);
  const beatMembers = playback.playing ? (playback.track?.members ?? null) : null;
  useEffect(() => {
    if (beatMembers === null) {
      setMemberStates(null);
      return;
    }
    const states: Record<string, PlaybackMemberState> = {};
    for (const member of party) {
      const shown = beatMembers[member.id];
      if (!shown) continue;
      const dead = shown.down && shown.conditions.includes('dead');
      states[member.id] = { hp: shown.hp, maxHp: member.max_hp, conditions: shown.conditions, dead };
    }
    setMemberStates(states);
  }, [beatMembers, party, setMemberStates]);
  useEffect(
    () => () => {
      setPlaying(false);
      setMoment(null);
      setMemberStates(null);
    },
    [setPlaying, setMoment, setMemberStates],
  );
}
