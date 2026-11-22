/**
 * The party's light, in the words the map's light chip and the party panel both use: "The party has no light."
 * when dark, and "Brenna's torch, about 6 turns left" for each light that burns.
 *
 * ```tsx
 * const light = usePartyLight();
 * <span className={light.lit ? undefined : styles.dark}>{light.text}</span>
 * ```
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { ROUNDS_PER_TURN } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useFeed, useParty, usePlayerView } from './table/hooks';

/** What the party panel and the map say when no light burns. */
export const NO_LIGHT_TEXT = 'The party has no light.';
/** What they say when magical darkness is on a member. */
export const DARKNESS_TEXT = 'Magical darkness covers the party.';

/** One light that burns on a member. */
export interface MemberLight {
  memberId: string;
  name: string;
  /** What gives the light, as a noun for "Brenna's torch": `torch`, `lantern`, `magical light`, or `light`. */
  noun: string;
  /** Rounds left, or `null` for a light that doesn't go out. */
  remainingRounds: number | null;
  /** The light in words: "Brenna's torch, about 6 turns left". */
  text: string;
}

export interface PartyLight {
  /** Each member's light, the longest-lasting one for a member with several, in marching order. */
  lights: MemberLight[];
  /** Whether magical darkness is on a member, which puts out the party's light. */
  darkness: boolean;
  /** Whether the party can see: some light burns and no darkness covers it. */
  lit: boolean;
  /** The summary: {@link NO_LIGHT_TEXT}, {@link DARKNESS_TEXT}, or each light's text, joined with ". ". */
  text: string;
}

/**
 * How long a light has left, short enough for a status line: "about 6 turns" while a turn or more is left, and
 * the rounds after that. A turn is 60 rounds.
 *
 * @param rounds - Rounds left, or `null` for a light that doesn't go out.
 */
export function lightTimeLeft(rounds: number | null): string | null {
  if (rounds === null) return null;
  if (rounds >= ROUNDS_PER_TURN) {
    const turns = Math.round(rounds / ROUNDS_PER_TURN);
    return turns === 1 ? 'about 1 turn' : `about ${turns} turns`;
  }
  return rounds === 1 ? '1 round' : `${rounds} rounds`;
}

/**
 * One light in words: "Brenna's torch, about 6 turns left", or "Brenna's magical light" for one that lasts.
 *
 * @param name - The member's name.
 * @param noun - What gives the light.
 * @param remainingRounds - Rounds left, or `null`.
 */
export function lightLine(name: string, noun: string, remainingRounds: number | null): string {
  const left = lightTimeLeft(remainingRounds);
  return left ? `${name}'s ${noun}, ${left} left` : `${name}'s ${noun}`;
}

const SOURCE_NOUNS: Record<string, string> = {
  torch: 'torch',
  lantern: 'lantern',
  light: 'magical light',
  continual_light: 'magical light',
  sword: 'glowing sword',
};

/** The light sources a member carries, from the item params that state a light radius. */
function carriedSources(member: MemberView): Set<string> {
  const kinds = new Set<string>();
  const items = member.inventory['items'];
  if (!Array.isArray(items)) return kinds;
  for (const entry of items) {
    if (typeof entry !== 'object' || entry === null) continue;
    const template = (entry as Record<string, unknown>)['template'];
    if (typeof template !== 'object' || template === null) continue;
    const { id, params } = template as Record<string, unknown>;
    if (typeof id !== 'string' || typeof params !== 'object' || params === null) continue;
    if (typeof (params as Record<string, unknown>)['light_radius_feet'] === 'number') kinds.add(id);
  }
  return kinds;
}

/**
 * Builds the party's light from the player view's effects, with each source from the light events the feed holds,
 * or from the pack when the feed no longer holds the event and the member carries one kind of light.
 */
export function partyLightFrom(
  effects: ReadonlyArray<{ kind: string; character_id: string; remaining_rounds: number | null }>,
  party: readonly MemberView[],
  sources: Readonly<Record<string, string>>,
): PartyLight {
  const burning = new Map<string, number | null>();
  let darkness = false;
  for (const effect of effects) {
    if (effect.kind === 'darkness' || effect.kind === 'continual_darkness') darkness = true;
    if (effect.kind !== 'light' && effect.kind !== 'continual_light') continue;
    const rounds = effect.remaining_rounds;
    if (!burning.has(effect.character_id)) burning.set(effect.character_id, rounds);
    else {
      const existing = burning.get(effect.character_id) ?? null;
      if (existing !== null && (rounds === null || rounds > existing))
        burning.set(effect.character_id, rounds);
    }
  }
  const lights: MemberLight[] = [];
  for (const member of party) {
    if (!burning.has(member.id)) continue;
    const remainingRounds = burning.get(member.id) ?? null;
    const source = sources[member.id];
    let noun = source !== undefined ? (SOURCE_NOUNS[source] ?? 'light') : 'light';
    if (source === undefined) {
      const carried = carriedSources(member);
      const [only] = carried;
      if (carried.size === 1 && only !== undefined && SOURCE_NOUNS[only]) noun = SOURCE_NOUNS[only] ?? noun;
    }
    lights.push({
      memberId: member.id,
      name: member.name,
      noun,
      remainingRounds,
      text: lightLine(member.name, noun, remainingRounds),
    });
  }
  const lit = lights.length > 0 && !darkness;
  const text = darkness
    ? DARKNESS_TEXT
    : lights.length === 0
      ? NO_LIGHT_TEXT
      : lights.map((l) => l.text).join('. ');
  return { lights, darkness, lit, text };
}

/** Each member's light source, from the newest light event about them in the feed. */
function useLightSources(): Record<string, string> {
  const feed = useFeed();
  return useMemo(() => {
    const sources: Record<string, string> = {};
    for (const entry of feed) {
      if (entry.kind !== 'game') continue;
      for (const event of entry.events) {
        if (event.event_type !== 'light') continue;
        const { character_id: member, source } = event as { character_id?: unknown; source?: unknown };
        if (typeof member !== 'string') continue;
        if (event.code === 'exploration.light.lit' && typeof source === 'string') sources[member] = source;
        else if (
          event.code === 'exploration.light.expired' ||
          event.code === 'exploration.light.extinguished'
        )
          delete sources[member];
      }
    }
    return sources;
  }, [feed]);
}

/** The party's light, in the words the map and the party panel share. */
export function usePartyLight(): PartyLight {
  const view = usePlayerView();
  const party = useParty();
  const sources = useLightSources();
  return useMemo(() => partyLightFrom(view?.effects ?? [], party, sources), [view?.effects, party, sources]);
}
