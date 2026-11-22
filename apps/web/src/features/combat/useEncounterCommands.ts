/**
 * The party's encounter commands, shared by the encounter panel and the action bar so both offer the same
 * choices with the same permissions.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { FeedEntry } from '@bxvtt/shared/protocol';
import { useEffect, useMemo, useState } from 'react';
import {
  getApi,
  loadCatalog,
  useCanActForParty,
  useEncounter,
  useFeed,
  useLegalCommands,
  useParty,
  usePermissionContext,
  canSendCommand,
  useSendCommand,
  type ClassDetail,
  type Permission,
} from '@/app';
import type { AnyEvent } from './playback';

/** The class IDs whose class can turn undead, from the class catalog. */
export function useTurnerClasses(classIds: readonly string[]): string[] {
  const key = [...new Set(classIds)].sort().join(',');
  const [turners, setTurners] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const ids = key === '' ? [] : key.split(',');
    Promise.all(
      ids.map(async (classId) => {
        try {
          const path = `classes/${classId}`;
          const entry = await loadCatalog<ClassDetail>(`entry:${path}`, () =>
            getApi().rules<ClassDetail>(path),
          );
          return entry.abilities.some((a) => a.tag === 'turn_undead') ? classId : null;
        } catch {
          return null;
        }
      }),
    ).then((found) => {
      if (!cancelled) setTurners(found.filter((id): id is string => id !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return turners;
}

/** The surprise the encounter opened with, from the newest `encounter_started` event in the feed. */
export function useEncounterOpening(): {
  partySurprised: boolean;
  monstersSurprised: boolean;
  /** Referee-only rolls of the opening: surprise and reaction, in the referee's copy of the feed. */
  refereeEvents: AnyEvent[];
} {
  const feed = useFeed();
  return useMemo(() => openingFrom(feed), [feed]);
}

/** Reads the encounter's opening from the feed. */
export function openingFrom(feed: readonly FeedEntry[]): ReturnType<typeof useEncounterOpening> {
  const refereeEvents: AnyEvent[] = [];
  for (let i = feed.length - 1; i >= 0; i -= 1) {
    const entry = feed[i];
    if (entry?.kind !== 'game') continue;
    const events = entry.events as AnyEvent[];
    const started = events.find((e) => e.event_type === 'encounter_started');
    // Later reaction rolls (after a parley or a wait) matter too, so collect them on the way back.
    for (const e of [...events].reverse())
      if (
        e.event_type === 'reaction_rolled' &&
        !refereeEvents.some((r) => r.event_type === 'reaction_rolled')
      )
        refereeEvents.push(e);
    if (started) {
      for (const e of events) if (e.event_type === 'surprise_rolled') refereeEvents.push(e);
      return {
        partySurprised: started.party_surprised === true,
        monstersSurprised: started.monsters_surprised === true,
        refereeEvents,
      };
    }
  }
  return { partySurprised: false, monstersSurprised: false, refereeEvents };
}

/** The member with the best reaction modifier among those who can act, for "who speaks". */
export function bestSpeaker(party: readonly MemberView[], declarers: readonly string[]): MemberView | null {
  const able = party.filter((m) => declarers.includes(m.id));
  let best: MemberView | null = null;
  for (const member of able)
    if (best === null || member.npc_reaction_modifier > best.npc_reaction_modifier) best = member;
  return best;
}

export interface EncounterCommands {
  pursuit: boolean;
  /** Permission for each party command, with a reason to show when it is refused. */
  can: (commandType: string, memberId?: string) => Permission;
  legal: (commandType: string) => boolean;
  partyPermission: Permission;
  pending: boolean;
  pendingType: string | null;
  speaker: MemberView | null;
  talk: (speakerId: string) => void;
  wait: () => void;
  flee: (drop: 'none' | 'treasure' | 'food') => void;
  fight: () => void;
  turn: (memberId: string) => void;
}

export function useEncounterCommands(): EncounterCommands {
  const encounter = useEncounter();
  const party = useParty();
  const legalCommands = useLegalCommands();
  const ctx = usePermissionContext();
  const partyPermission = useCanActForParty();
  const { send, pending, pendingType } = useSendCommand();
  const pursuit = encounter?.pursuit_gap_feet !== null && encounter?.pursuit_gap_feet !== undefined;
  return useMemo(
    () => ({
      pursuit,
      can: (commandType: string, memberId?: string) => canSendCommand(ctx, commandType, memberId),
      legal: (commandType: string) => legalCommands.some((c) => c.command_type === commandType),
      partyPermission,
      pending,
      pendingType,
      speaker: bestSpeaker(party, encounter?.declarers ?? []),
      talk: (speakerId: string) => void send({ command_type: 'parley', character_id: speakerId }),
      wait: () => void send({ command_type: 'wait' }),
      flee: (drop: 'none' | 'treasure' | 'food') => void send({ command_type: 'evade', drop }),
      fight: () => void send({ command_type: 'engage_battle' }),
      turn: (memberId: string) => void send({ command_type: 'turn_undead', character_id: memberId }),
    }),
    [pursuit, ctx, legalCommands, partyPermission, pending, pendingType, party, encounter, send],
  );
}
